import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { queryAllPeople, queryAllTargets } from "@/lib/notion";
import { channelsForPerson } from "@/lib/aggregate";
import { attachHasTouchToday, createLead, listLeads, listTouches, type Lead } from "@/lib/pipeline-db";
import { isPipelineSource } from "@/lib/pipeline-constants";

/**
 * GET — any authenticated session (BD or admin) can read every lead (rule
 * §2: read visibility is enforced by which endpoints exist, not by
 * filtering after the fact — this route simply never restricts by owner).
 * Each lead is annotated with `hasTouchToday`, computed server-side from
 * the *owner's* effectiveDate — that's the date a touch on this lead would
 * be filed under, since only the owner (or an admin acting for them) can
 * ever log one (rule §1).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const [leads, touches, people] = await Promise.all([
      listLeads(),
      listTouches(),
      queryAllPeople(),
    ]);

    const timezoneByPerson = new Map(people.map((p) => [p.name, p.timezone]));
    const result = attachHasTouchToday(leads, touches, timezoneByPerson);

    return NextResponse.json({ ok: true, leads: result });
  } catch (error) {
    console.error(
      "Failed to load pipeline leads:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to load leads." }, { status: 500 });
  }
}

/** POST — create a lead. `owner` is always the session identity, never client-supplied. */
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

  const { name, source, proofLink, contactChannel, contactInfo, notes } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "A lead name is required." }, { status: 400 });
  }

  if (!isPipelineSource(source)) {
    return NextResponse.json({ ok: false, error: "A valid source is required." }, { status: 400 });
  }

  if (typeof proofLink !== "string" || proofLink.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "A proof link is required." }, { status: 400 });
  }
  try {
    new URL(proofLink);
  } catch {
    return NextResponse.json({ ok: false, error: "Proof link must be a valid URL." }, { status: 400 });
  }

  // Rule §6: contact_channel must come from this BD's own Targets-derived
  // channel list — same source of truth /log already uses, never hardcoded.
  const targets = await queryAllTargets();
  const allowedChannels = channelsForPerson(session.person, targets);
  if (typeof contactChannel !== "string" || !allowedChannels.includes(contactChannel)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          allowedChannels.length > 0
            ? `Contact channel must be one of: ${allowedChannels.join(", ")}`
            : "You have no active responsibilities yet — add one in /admin first.",
      },
      { status: 400 }
    );
  }

  if (typeof contactInfo !== "string" || contactInfo.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Contact info is required." }, { status: 400 });
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ ok: false, error: "Notes must be text." }, { status: 400 });
  }

  try {
    const lead: Lead = await createLead({
      name: name.trim(),
      source,
      proofLink: proofLink.trim(),
      contactChannel,
      contactInfo: contactInfo.trim(),
      notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 2000) : undefined,
      owner: session.person,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    console.error(
      "Failed to create lead:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to create lead." }, { status: 500 });
  }
}
