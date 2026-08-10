import "server-only";

import {
  queryDailyLogByDateRange,
  queryAllTargets,
  queryVisibleComments,
  queryAllPeople,
} from "./notion";
import { addDaysISO, buildDashboard, type DashboardResult } from "./aggregate";

/**
 * Shared by /api/dashboard and the weekly Slack digest cron (§16g) — same
 * four-query load, same aggregation, so the numbers posted to Slack are
 * exactly the numbers rendered on the dashboard, never a second computation
 * that could drift from it.
 */
export async function loadDashboard(now: Date = new Date()): Promise<DashboardResult> {
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

  return buildDashboard({ people, logs, targets, now, comments });
}
