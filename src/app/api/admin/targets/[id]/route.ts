import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { updateTargetDailyTarget } from "@/lib/notion";

/** Inline target editing (§13c) — /targets stays read-only for members; this is admin-only. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { dailyTarget } = (body ?? {}) as Record<string, unknown>;
  if (typeof dailyTarget !== "number" || !Number.isFinite(dailyTarget) || dailyTarget < 0) {
    return NextResponse.json(
      { ok: false, error: "dailyTarget must be a number ≥ 0." },
      { status: 400 }
    );
  }

  try {
    await updateTargetDailyTarget(id, dailyTarget);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to update target:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to update target." }, { status: 500 });
  }
}
