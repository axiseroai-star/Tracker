import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { updateDailyLogFlags } from "@/lib/notion";

/** Archive/restore and flag/unflag a Daily Log row. Never a hard delete (§13c). */
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

  const { archived, flagged } = (body ?? {}) as Record<string, unknown>;
  if (archived !== undefined && typeof archived !== "boolean") {
    return NextResponse.json({ ok: false, error: "archived must be a boolean." }, { status: 400 });
  }
  if (flagged !== undefined && typeof flagged !== "boolean") {
    return NextResponse.json({ ok: false, error: "flagged must be a boolean." }, { status: 400 });
  }
  if (archived === undefined && flagged === undefined) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    await updateDailyLogFlags(id, { archived, flagged });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to update entry:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to update entry." }, { status: 500 });
  }
}
