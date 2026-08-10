import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { queryDailyLogByDateRange, queryAllPeople } from "@/lib/notion";
import { addDaysISO, buildTrends } from "@/lib/aggregate";

/**
 * Per-person output over the last 30 or 90 days (§16a) — one paginated
 * Daily Log query (queryDailyLogByDateRange already pages via start_cursor
 * internally; 90 days x several people x several channels can exceed a
 * single page), aggregated in memory.
 */
export async function GET(request: NextRequest) {
  try {
    const daysParam = Number(request.nextUrl.searchParams.get("days"));
    const days = daysParam === 90 ? 90 : 30;

    const now = new Date();
    const endISO = now.toISOString().slice(0, 10);
    const startISO = addDaysISO(endISO, -(days - 1));

    const [logs, allPeople] = await Promise.all([
      queryDailyLogByDateRange(startISO, endISO),
      queryAllPeople(),
    ]);
    const people = allPeople.filter((p) => p.active);

    const trends = buildTrends({ people, logs, startISO, endISO });
    return NextResponse.json({ days, startISO, endISO, people: trends });
  } catch (error) {
    console.error(
      "Failed to build trends:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load trends." }, { status: 500 });
  }
}
