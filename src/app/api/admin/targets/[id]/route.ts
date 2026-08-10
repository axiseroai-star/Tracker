import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { updateTargetArchived, updateTargetDailyTarget } from "@/lib/notion";

/**
 * Inline target editing (§13c) and archive/restore a responsibility (§18c) —
 * /targets stays read-only for members; this is admin-only. Body may include
 * `dailyTarget`, `archived`, or both.
 */
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

  const { dailyTarget, archived } = (body ?? {}) as Record<string, unknown>;

  if (dailyTarget !== undefined) {
    if (typeof dailyTarget !== "number" || !Number.isFinite(dailyTarget) || dailyTarget < 0) {
      return NextResponse.json(
        { ok: false, error: "dailyTarget must be a number ≥ 0." },
        { status: 400 }
      );
    }
  }
  if (archived !== undefined && typeof archived !== "boolean") {
    return NextResponse.json({ ok: false, error: "archived must be a boolean." }, { status: 400 });
  }
  if (dailyTarget === undefined && archived === undefined) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    if (typeof dailyTarget === "number") await updateTargetDailyTarget(id, dailyTarget);
    if (typeof archived === "boolean") await updateTargetArchived(id, archived);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to update target:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to update target." }, { status: 500 });
  }
}
