import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createDailyLogEntry, queryAllPeople, queryAllTargets } from "@/lib/notion";
import { channelsForPerson, effectiveDate } from "@/lib/aggregate";
import { getSession } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const { person, channel, date, outputCount, notes } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof person !== "string" || person.length === 0) {
    return NextResponse.json({ ok: false, error: "A valid person is required." }, { status: 400 });
  }

  // §20c: acting as yourself is always allowed; acting as someone else is
  // the one deliberate exception, and only for admin (their /admin "log for
  // anyone" form) — derived from whether the submitted person matches the
  // verified session identity, never from a client-supplied flag.
  const actingAsSelf = person === session.person;
  if (!actingAsSelf && session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "You can only log entries as yourself." },
      { status: 403 }
    );
  }

  // Live roster/responsibilities (§18) — cached, so this is cheap even
  // though it's re-fetched on every submission.
  const [allPeople, targets] = await Promise.all([queryAllPeople(), queryAllTargets()]);
  const personRecord = allPeople.find((p) => p.name === person && p.active);
  if (!personRecord) {
    return NextResponse.json(
      { ok: false, error: "Person must be an active team member." },
      { status: 400 }
    );
  }

  const allowedChannels = channelsForPerson(person, targets);
  if (typeof channel !== "string" || !allowedChannels.includes(channel)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          allowedChannels.length > 0
            ? `Channel must be one of: ${allowedChannels.join(", ")}`
            : `${person} has no active responsibilities yet — add one in /admin first.`,
      },
      { status: 400 }
    );
  }

  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ ok: false, error: "A valid date is required." }, { status: 400 });
  }

  // §14b: acting as yourself can't backdate/postdate at all — the client
  // locks the field, but that's a UX nicety, not enforcement. Recompute
  // independently here and reject anything that doesn't match. Acting as
  // someone else (admin only, checked above) skips this — that's the only
  // path backfills go through.
  if (actingAsSelf) {
    const expectedDate = effectiveDate(personRecord.timezone);
    if (date !== expectedDate) {
      return NextResponse.json(
        { ok: false, error: `Date must be ${expectedDate} (today for ${person}).` },
        { status: 400 }
      );
    }
  }

  if (
    typeof outputCount !== "number" ||
    !Number.isFinite(outputCount) ||
    !Number.isInteger(outputCount) ||
    outputCount < 0
  ) {
    return NextResponse.json(
      { ok: false, error: "Output count must be a whole number ≥ 0." },
      { status: 400 }
    );
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ ok: false, error: "Notes must be text." }, { status: 400 });
  }

  try {
    await createDailyLogEntry({
      person,
      channel,
      date,
      outputCount,
      notes: typeof notes === "string" ? notes.slice(0, 2000) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to create log entry:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to save entry." }, { status: 500 });
  }
}
