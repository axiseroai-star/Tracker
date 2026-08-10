import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { queryAllDailyLogEntriesForAdmin } from "@/lib/notion";

/** Full Daily Log history (incl. archived) — admin only, checked server-side on every request. */
export async function GET() {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  try {
    const entries = await queryAllDailyLogEntriesForAdmin();
    return NextResponse.json({ entries });
  } catch (error) {
    console.error(
      "Failed to load admin entries:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load entries." }, { status: 500 });
  }
}
