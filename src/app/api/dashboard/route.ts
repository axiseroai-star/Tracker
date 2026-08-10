import { NextResponse } from "next/server";
import {
  queryDailyLogByDateRange,
  queryAllTargets,
  queryVisibleComments,
  queryAllPeople,
} from "@/lib/notion";
import { addDaysISO, buildDashboard } from "@/lib/aggregate";

/**
 * Four Notion queries per load: Daily Log, Targets (cached), visible
 * Comments (§13d/§16d), and People (cached, §18) — never a loop per
 * person/channel/entry.
 *
 * The Daily Log query uses one date range buffered wide enough to cover
 * every person's own window regardless of timezone (§14c), plus headroom
 * for streaks (§16b) to look back up to ~35 days without a second query —
 * roughly today-35 to today+1 in UTC. buildDashboard then filters/aggregates
 * each person's actual [effectiveDate-6, effectiveDate] window (and streak)
 * from that single in-memory set.
 */
export async function GET() {
  try {
    const now = new Date();
    const todayUTC = now.toISOString().slice(0, 10);
    const bufferStartISO = addDaysISO(todayUTC, -35);
    const bufferEndISO = addDaysISO(todayUTC, 1);

    const [logs, targets, comments, allPeople] = await Promise.all([
      queryDailyLogByDateRange(bufferStartISO, bufferEndISO),
      queryAllTargets(),
      queryVisibleComments(),
      queryAllPeople(),
    ]);
    const people = allPeople.filter((p) => p.active);

    const dashboard = buildDashboard({ people, logs, targets, now, comments });
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
