import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { createPerson, queryAllPeople } from "@/lib/notion";

/** Every person, active and inactive — admin's Team section (§18d). */
export async function GET() {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  try {
    const people = await queryAllPeople();
    return NextResponse.json({ people });
  } catch (error) {
    console.error(
      "Failed to load people:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load people." }, { status: 500 });
  }
}

/** "Add a team member" (§18d) — new row, Active = true, name ensured as a valid Person/Author option everywhere. */
export async function POST(request: NextRequest) {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const { name, timezone } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  }
  if (typeof timezone !== "string" || timezone.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Timezone is required." }, { status: 400 });
  }
  // Cheap sanity check that it's at least a plausible IANA zone string.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone.trim() });
  } catch {
    return NextResponse.json(
      { ok: false, error: `"${timezone}" isn't a recognized timezone (e.g. "Asia/Karachi").` },
      { status: 400 }
    );
  }

  try {
    await createPerson({ name: name.trim(), timezone: timezone.trim() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Failed to create person:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "Failed to add team member." }, { status: 500 });
  }
}
