import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession, requireOwnerOrAdmin } from "@/lib/auth";
import { queryAllPeople } from "@/lib/notion";
import { effectiveDate } from "@/lib/aggregate";
import { createTouch, DuplicateTouchError, getLeadById } from "@/lib/pipeline-db";
import { isPipelineOutcome, TERMINAL_STATUSES } from "@/lib/pipeline-constants";

/**
 * POST — log a touch on a lead. `bdPerson` is always the session identity;
 * `date` is always server-computed via effectiveDate() (rule §7), never
 * accepted from the client.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { leadId, outcome, notes } = (body ?? {}) as Record<string, unknown>;

  const leadIdNum = Number(leadId);
  if (!Number.isInteger(leadIdNum)) {
    return NextResponse.json({ ok: false, error: "A valid leadId is required." }, { status: 400 });
  }

  const lead = await getLeadById(leadIdNum);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  // Rule §1: a BD can only touch their own leads; admin can touch any.
  const denied = await requireOwnerOrAdmin(lead.owner);
  if (denied) return denied;

  // Rule §4: terminal states reject any further touch POSTs — a BD wanting
  // to re-approach creates a brand new lead row instead of reopening this one.
  // An archived lead (soft-deleted) is blocked the same way.
  if (lead.archivedAt !== null) {
    return NextResponse.json(
      { ok: false, error: "This lead has been deleted and can no longer be touched." },
      { status: 403 }
    );
  }
  if (TERMINAL_STATUSES.includes(lead.status)) {
    return NextResponse.json(
      { ok: false, error: `This lead is ${lead.status} and can no longer be touched.` },
      { status: 403 }
    );
  }

  if (!isPipelineOutcome(outcome)) {
    return NextResponse.json({ ok: false, error: "A valid outcome is required." }, { status: 400 });
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ ok: false, error: "Notes must be text." }, { status: 400 });
  }

  // Rule §7: date is server-computed from the acting person's own timezone —
  // same source (Axisero People) and helper /log already uses.
  const people = await queryAllPeople();
  const actor = people.find((p) => p.name === session.person);
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Your person record could not be found." },
      { status: 400 }
    );
  }
  const date = effectiveDate(actor.timezone);

  try {
    const { touch, lead: updatedLead } = await createTouch({
      leadId: leadIdNum,
      bdPerson: session.person,
      date,
      outcome,
      notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 2000) : undefined,
    });
    return NextResponse.json({ ok: true, touch, lead: updatedLead });
  } catch (error) {
    // Rule §3: the DB's UNIQUE(lead_id, date) constraint is the source of
    // truth — this catches the race rather than pre-checking then inserting.
    if (error instanceof DuplicateTouchError) {
      return NextResponse.json({ ok: false, error: "Already logged today." }, { status: 409 });
    }
    console.error(
      "Failed to create touch:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to log touch." }, { status: 500 });
  }
}
