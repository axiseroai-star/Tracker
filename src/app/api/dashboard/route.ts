import { NextResponse } from "next/server";
import { queryDailyLogByDateRange, queryAllTargets, queryVisibleComments } from "@/lib/notion";
import { addDaysISO, buildDashboard } from "@/lib/aggregate";

/**
 * Three Notion queries per load: Daily Log, Targets (cached), and visible
 * Comments (§13d comment-count badge) — never a loop per person/channel/entry.
 *
 * The Daily Log query uses one date range buffered wide enough to cover
 * every person's own window regardless of timezone (§14c) — roughly
 * today-8 to today+1 in UTC — rather than a per-person range. buildDashboard
 * then filters/aggregates each person's actual [effectiveDate-6,
 * effectiveDate] window from that single in-memory set.
 */
export async function GET() {
  try {
    const now = new Date();
    const todayUTC = now.toISOString().slice(0, 10);
    const bufferStartISO = addDaysISO(todayUTC, -8);
    const bufferEndISO = addDaysISO(todayUTC, 1);

    const [logs, targets, comments] = await Promise.all([
      queryDailyLogByDateRange(bufferStartISO, bufferEndISO),
      queryAllTargets(),
      queryVisibleComments(),
    ]);

    const dashboard = buildDashboard({ logs, targets, now, comments });
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error(
      "Failed to build dashboard:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 }
    );
  }
}
