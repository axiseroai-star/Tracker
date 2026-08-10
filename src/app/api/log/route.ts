import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createDailyLogEntry } from "@/lib/notion";
import { PEOPLE, PERSON_CHANNELS, type Channel, type Person } from "@/lib/constants";
import { effectiveDate } from "@/lib/aggregate";
import { getSession } from "@/lib/auth";

function isPerson(value: unknown): value is Person {
  return typeof value === "string" && (PEOPLE as readonly string[]).includes(value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
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

  if (!isPerson(person)) {
    return NextResponse.json({ ok: false, error: "A valid person is required." }, { status: 400 });
  }

  const allowedChannels = PERSON_CHANNELS[person];
  if (typeof channel !== "string" || !allowedChannels.includes(channel as Channel)) {
    return NextResponse.json(
      { ok: false, error: `Channel must be one of: ${allowedChannels.join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ ok: false, error: "A valid date is required." }, { status: 400 });
  }

  // §14b: members can't backdate/postdate at all — the client locks the field,
  // but that's a UX nicety, not enforcement. Recompute independently here and
  // reject anything that doesn't match. Admin's "log for anyone" form skips
  // this check entirely — that's the only path backfills go through.
  const session = await getSession();
  const isAdmin = session?.role === "admin";
  if (!isAdmin) {
    const expectedDate = effectiveDate(person);
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
      channel: channel as Channel,
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
