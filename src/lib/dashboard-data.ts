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
  // Wide enough to cover every person's own current-week AND previous-week
  // window regardless of timezone (§14c): in the worst-case timezone offset,
  // a person's prevStartISO can fall as far back as todayUTC-14, plus one
  // day of slack.
  const bufferStartISO = addDaysISO(todayUTC, -15);
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
