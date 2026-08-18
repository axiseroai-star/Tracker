import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { queryAllPeople } from "@/lib/notion";
import { TRANSFERABLE_STATUSES } from "@/lib/pipeline-constants";
import { getLeadById, transferLead, TransferNotEligibleError } from "@/lib/pipeline-db";

/**
 * POST — transfer a lead's ownership to a different person. Intentionally
 * open: ANY authenticated person may transfer ANY eligible lead to ANY
 * other active person, not just their own leads — confirmed with the CEO
 * (Ahsan), a deliberate departure from requireOwnerOrAdmin() used by every
 * other write route in this feature. Only a valid session is required here,
 * the same check GET /api/pipeline/leads already uses.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ ok: false, error: "Invalid lead id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const { toOwner, note } = (body ?? {}) as Record<string, unknown>;

  if (typeof toOwner !== "string" || toOwner.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "A new owner is required." }, { status: 400 });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return NextResponse.json({ ok: false, error: "Note must be text." }, { status: 400 });
  }

  const lead = await getLeadById(leadId);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  // Same terminal/archived blocks as touches (rule "which leads can be
  // transferred"), plus Interested is excluded on purpose — that stage goes
  // through admin's Take Over review, and Transfer must not be a way around it.
  if (lead.archivedAt !== null) {
    return NextResponse.json(
      { ok: false, error: "This lead has been deleted and can no longer be transferred." },
      { status: 400 }
    );
  }
  if (!(TRANSFERABLE_STATUSES as readonly string[]).includes(lead.status)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          lead.status === "Interested"
            ? "Interested leads go through Take Over, not Transfer."
            : `This lead is ${lead.status} and can no longer be transferred.`,
      },
      { status: 400 }
    );
  }

  if (toOwner === lead.owner) {
    return NextResponse.json(
      { ok: false, error: "Lead is already assigned to this person." },
      { status: 400 }
    );
  }

  // Rule §1: toOwner must be a real, active person — the same roster source
  // of truth /log's "log for anyone" and /login already pull from — never a
  // free-text name.
  const people = await queryAllPeople();
  const validOwner = people.some((p) => p.active && p.name === toOwner);
  if (!validOwner) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid active team member to transfer to." },
      { status: 400 }
    );
  }

  try {
    const { lead: updatedLead, transfer } = await transferLead({
      leadId,
      fromOwner: lead.owner,
      toOwner,
      transferredBy: session.person,
      note: typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : undefined,
    });
    return NextResponse.json({ ok: true, lead: updatedLead, transfer });
  } catch (error) {
    if (error instanceof TransferNotEligibleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error(
      "Failed to transfer lead:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to transfer lead." }, { status: 500 });
  }
}
