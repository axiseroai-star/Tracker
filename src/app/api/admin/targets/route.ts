import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { createTargetRow } from "@/lib/notion";

/** "Add a responsibility" (§18c) — a new Person x Channel Targets row. */
export async function POST(request: NextRequest) {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { person, channel, dailyTarget, unit } = (body ?? {}) as Record<string, unknown>;

  if (typeof person !== "string" || person.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Person is required." }, { status: 400 });
  }
  if (typeof channel !== "string" || channel.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Channel is required." }, { status: 400 });
  }
  if (typeof dailyTarget !== "number" || !Number.isFinite(dailyTarget) || dailyTarget < 0) {
    return NextResponse.json(
      { ok: false, error: "Daily target must be a number ≥ 0." },
      { status: 400 }
    );
  }
  if (unit !== undefined && typeof unit !== "string") {
    return NextResponse.json({ ok: false, error: "Unit must be text." }, { status: 400 });
  }

  try {
    await createTargetRow({
      person: person.trim(),
      channel: channel.trim(),
      dailyTarget,
      unit: typeof unit === "string" ? unit.trim() : "",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to create responsibility:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { ok: false, error: "Failed to add responsibility." },
      { status: 500 }
    );
  }
}
