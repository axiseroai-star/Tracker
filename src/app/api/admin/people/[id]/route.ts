import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { resetPersonPin, updatePerson } from "@/lib/notion";

/** Toggle Active, edit Timezone, and/or reset PIN (§18d, §20d). Never deletes the row. */
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

  const { active, timezone, resetPin } = (body ?? {}) as Record<string, unknown>;
  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ ok: false, error: "active must be a boolean." }, { status: 400 });
  }
  if (timezone !== undefined) {
    if (typeof timezone !== "string" || timezone.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "timezone must be text." }, { status: 400 });
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone.trim() });
    } catch {
      return NextResponse.json(
        { ok: false, error: `"${timezone}" isn't a recognized timezone.` },
        { status: 400 }
      );
    }
  }
  if (resetPin !== undefined && resetPin !== true) {
    return NextResponse.json({ ok: false, error: "resetPin must be true." }, { status: 400 });
  }
  if (active === undefined && timezone === undefined && resetPin === undefined) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    if (active !== undefined || timezone !== undefined) {
      await updatePerson(id, {
        active,
        timezone: typeof timezone === "string" ? timezone.trim() : undefined,
      });
    }
    // §20d: clears PIN Hash — that person's next login re-triggers "Create your PIN."
    if (resetPin === true) {
      await resetPersonPin(id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to update person:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to update team member." }, { status: 500 });
  }
}
