import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/auth";
import { queryDailyLogByDateRange } from "@/lib/notion";
import { addDaysISO, buildChannelAverages } from "@/lib/aggregate";

const WINDOW_DAYS = 14;

/** "Recent avg" figures for the inline target editor (§16c) — 14-day daily average per person/channel. */
export async function GET() {
  const denied = await requireAdminResponse();
  if (denied) return denied;

  try {
    const endISO = new Date().toISOString().slice(0, 10);
    const startISO = addDaysISO(endISO, -(WINDOW_DAYS - 1));
    const logs = await queryDailyLogByDateRange(startISO, endISO);
    const averages = buildChannelAverages({ logs, startISO, endISO });
    return NextResponse.json({ windowDays: WINDOW_DAYS, averages });
  } catch (error) {
    console.error(
      "Failed to compute target suggestions:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load suggestions." }, { status: 500 });
  }
}
