/**
 * Pure aggregation logic: rolling-window math, attainment/status rules,
 * per-person day boundaries, and the full dashboard shape-building used by
 * /api/dashboard.
 *
 * Side-effect-free (no Notion calls) so it's easy to unit test — see
 * aggregate.test.ts. `now` is always an injectable parameter rather than
 * read from `Date.now()` internally, for the same reason.
 */

import { formatInTimeZone } from "date-fns-tz";
import {
  AVATAR_COLORS,
  CHANNELS,
  DAY_CUTOFF_HOUR,
  PEOPLE,
  PERSON_CHANNELS,
  PERSON_TIMEZONES,
  STATUS,
  type Channel,
  type Person,
  type StatusKey,
} from "./constants";

// ---------------------------------------------------------------------------
// Date helpers
//
// All ISO date strings in this module are plain "YYYY-MM-DD" calendar dates
// (no time component). They're anchored to UTC midnight internally purely as
// a stable arithmetic base — a calendar date's weekday doesn't depend on
// timezone, so this never mis-classifies Mon–Fri.
// ---------------------------------------------------------------------------

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, delta: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISO(d);
}

/** Inclusive list of YYYY-MM-DD strings from start to end. */
export function dateRangeISO(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cur = startISO;
  // Guard against an inverted range.
  while (toUTCDate(cur) <= toUTCDate(endISO)) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

/**
 * "What day is it" for a given person (§14a) — converts `now` into their
 * IANA timezone, and if the local hour is before DAY_CUTOFF_HOUR, treats it
 * as still being the previous calendar day. This is the single source of
 * truth every other per-person rule (missed-today, rolling windows, the
 * /log date lock) is built on top of.
 *
 * Uses date-fns-tz's `formatInTimeZone` rather than constructing a zoned
 * `Date` and reading its getters — that pattern is deceptively easy to get
 * wrong (the returned Date's getters are only meaningful via specific
 * accessors, and the "wrong" ones can silently produce plausible-looking
 * but incorrect results that happen to work on a dev machine whose system
 * timezone masks the bug, then fail once deployed). `formatInTimeZone`
 * sidesteps all of that by formatting directly, independent of the host's
 * own timezone setting.
 */
export function effectiveDate(person: Person, now: Date = new Date()): string {
  const timeZone = PERSON_TIMEZONES[person];
  const [localDate, hourStr] = formatInTimeZone(now, timeZone, "yyyy-MM-dd HH").split(" ");
  const hour = Number(hourStr);
  return hour < DAY_CUTOFF_HOUR ? addDaysISO(localDate, -1) : localDate;
}

/** Count of Mon–Fri calendar dates between start and end, inclusive. */
export function workingDays(startISO: string, endISO: string): number {
  let count = 0;
  for (const iso of dateRangeISO(startISO, endISO)) {
    const day = toUTCDate(iso).getUTCDay(); // 0=Sun ... 6=Sat
    if (day >= 1 && day <= 5) count++;
  }
  return count;
}

/** The rolling [today-6, today] 7-day window for a given "today", plus the 7 days before it. */
export function rollingWindow(todayISO: string) {
  const endISO = todayISO;
  const startISO = addDaysISO(todayISO, -6);
  const prevEndISO = addDaysISO(startISO, -1);
  const prevStartISO = addDaysISO(prevEndISO, -6);
  return { startISO, endISO, prevStartISO, prevEndISO };
}

// ---------------------------------------------------------------------------
// Core rules (§7 of the build spec)
// ---------------------------------------------------------------------------

export function weeklyTarget(dailyTarget: number, workingDaysInWindow: number): number {
  return dailyTarget * workingDaysInWindow;
}

/** Fraction (1.0 = 100%), or null when there's no target to measure against. */
export function attainment(actual: number, target: number): number | null {
  if (target === 0) return null;
  return actual / target;
}

export function status(att: number | null): StatusKey {
  if (att === null) return "NO_TARGET";
  if (att >= 1.0) return "ON_TRACK";
  if (att >= 0.7) return "BEHIND";
  return "AT_RISK";
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Dashboard aggregation
// ---------------------------------------------------------------------------

export interface DailyLogEntry {
  id: string; // Notion page id — needed to correlate comments (§13b) and for admin actions
  person: Person;
  channel: Channel;
  date: string; // YYYY-MM-DD
  outputCount: number;
  notes?: string;
  archived?: boolean;
  flagged?: boolean;
}

export interface TargetRow {
  id: string; // Notion page id — needed for admin inline editing (§13c)
  person: Person;
  channel: Channel;
  dailyTarget: number;
  unit: string;
}

/** Minimal shape needed to correlate a visible comment back to a person (§13d badge/popover). */
export interface CommentRef {
  id: string;
  logEntryId: string | null;
  comment: string;
  commentedAt: string | null;
}

/** A visible comment, resolved to the entry it's on — what the member-facing popover reads. */
export interface PersonComment {
  id: string;
  comment: string;
  channel: Channel;
  date: string; // YYYY-MM-DD, the log entry's date
  commentedAt: string | null;
}

export interface DashboardPerson {
  person: Person;
  avatarColor: string;
  initials: string;
  /** This person's own effectiveDate(now) — their window and missed-today check are anchored to it (§14c). */
  effectiveToday: string;
  windowStartISO: string;
  windowEndISO: string;
  workingDaysInWindow: number;
  weeklyTotal: number;
  weeklyTargetTotal: number;
  attainmentPct: number | null;
  statusKey: StatusKey;
  channelsActive: number;
  sparkline: number[]; // 7 values, oldest -> newest, aligned to this person's own window
  channelTags: Channel[]; // this person's assigned channels
  commentCount: number; // = comments.length, kept as a field since it's read so often
  comments: PersonComment[]; // visible comments on this person's entries, newest first
}

export interface ChannelMatrixCell {
  person: Person;
  channel: Channel;
  total: number;
  assigned: boolean; // whether this channel is in the person's normal lineup
}

export interface DashboardKpi {
  teamOutputThisWeek: number;
  teamOutputLastWeek: number;
  /** Percent delta vs the prior 7-day window, or null if there's no prior baseline. */
  teamOutputDeltaPct: number | null;
  teamAvgAttainmentPct: number | null;
  topPerformer: { person: Person; attainmentPct: number } | null;
  needsAttentionCount: number;
}

export interface DashboardResult {
  // No single windowStartISO/windowEndISO here (§14c) — each person's window
  // can differ by up to a day depending on their timezone and DAY_CUTOFF_HOUR,
  // so there's no one date range that honestly describes "the" window
  // anymore. See DashboardPerson.windowStartISO/windowEndISO for per-person.
  people: DashboardPerson[]; // default-sorted by attainment desc, no-target last
  missedToday: Person[];
  kpi: DashboardKpi;
  channelMatrix: ChannelMatrixCell[];
  isEmpty: boolean;
}

export function buildDashboard(params: {
  /**
   * Should span every person's possible window with buffer room — the
   * caller queries Notion once with a wide enough date range (§14c: roughly
   * today-8 to today+1 UTC) and this function filters/aggregates per person
   * from that single in-memory set. Never fetch per person.
   */
  logs: DailyLogEntry[];
  targets: TargetRow[];
  /** The reference instant every person's effectiveDate is derived from. Defaults to now. */
  now?: Date;
  /**
   * Visible comments to correlate into per-person popovers (§13d). Only
   * comments whose `logEntryId` matches an id in `logs` are surfaced — a
   * comment on an entry outside whatever range the caller fetched simply
   * won't show up here.
   */
  comments?: CommentRef[];
}): DashboardResult {
  const { logs, targets, now = new Date(), comments = [] } = params;

  const idToLog = new Map<string, DailyLogEntry>();
  for (const log of logs) idToLog.set(log.id, log);

  const commentsByPerson = new Map<Person, PersonComment[]>();
  for (const c of comments) {
    if (!c.logEntryId) continue;
    const log = idToLog.get(c.logEntryId);
    if (!log) continue;
    const list = commentsByPerson.get(log.person) ?? [];
    list.push({
      id: c.id,
      comment: c.comment,
      channel: log.channel,
      date: log.date,
      commentedAt: c.commentedAt,
    });
    commentsByPerson.set(log.person, list);
  }
  // Newest first, within each person.
  for (const list of commentsByPerson.values()) {
    list.sort((a, b) => (b.commentedAt ?? "").localeCompare(a.commentedAt ?? ""));
  }

  const inRange = (iso: string, from: string, to: string) =>
    toUTCDate(iso) >= toUTCDate(from) && toUTCDate(iso) <= toUTCDate(to);

  // person -> channel -> dailyTarget
  const targetMap = new Map<Person, Map<Channel, number>>();
  for (const t of targets) {
    if (!targetMap.has(t.person)) targetMap.set(t.person, new Map());
    targetMap.get(t.person)!.set(t.channel, t.dailyTarget);
  }

  const missedToday: Person[] = [];
  let teamOutputThisWeek = 0;
  let teamOutputLastWeek = 0;
  let anyEntriesThisWeek = false;
  const channelMatrix: ChannelMatrixCell[] = [];

  const people: DashboardPerson[] = PEOPLE.map((person) => {
    const effectiveToday = effectiveDate(person, now);
    const { startISO, endISO, prevStartISO, prevEndISO } = rollingWindow(effectiveToday);
    const workingDaysInWindow = workingDays(startISO, endISO);
    const windowDates = dateRangeISO(startISO, endISO);

    const personLogs = logs.filter((l) => l.person === person);
    const personWeekLogs = personLogs.filter((l) => inRange(l.date, startISO, endISO));
    const personLastWeekLogs = personLogs.filter((l) =>
      inRange(l.date, prevStartISO, prevEndISO)
    );

    const assignedChannels = PERSON_CHANNELS[person];
    const personTargets = targetMap.get(person);
    const weeklyTargetTotal = assignedChannels.reduce((sum, channel) => {
      const daily = personTargets?.get(channel) ?? 0;
      return sum + weeklyTarget(daily, workingDaysInWindow);
    }, 0);

    const weeklyTotal = personWeekLogs.reduce((sum, l) => sum + l.outputCount, 0);
    const lastWeekTotal = personLastWeekLogs.reduce((sum, l) => sum + l.outputCount, 0);
    teamOutputThisWeek += weeklyTotal;
    teamOutputLastWeek += lastWeekTotal;
    if (personWeekLogs.length > 0) anyEntriesThisWeek = true;

    const att = attainment(weeklyTotal, weeklyTargetTotal);
    const attainmentPct = att === null ? null : Math.round(att * 1000) / 10; // one decimal

    const channelsActive = new Set(personWeekLogs.map((l) => l.channel)).size;

    const sparkline = windowDates.map((date) =>
      personWeekLogs
        .filter((l) => l.date === date)
        .reduce((sum, l) => sum + l.outputCount, 0)
    );

    if (!personLogs.some((l) => l.date === effectiveToday)) {
      missedToday.push(person);
    }

    for (const channel of CHANNELS) {
      const total = personWeekLogs
        .filter((l) => l.channel === channel)
        .reduce((s, l) => s + l.outputCount, 0);
      channelMatrix.push({ person, channel, total, assigned: assignedChannels.includes(channel) });
    }

    const personComments = commentsByPerson.get(person) ?? [];

    return {
      person,
      avatarColor: AVATAR_COLORS[person],
      initials: getInitials(person),
      effectiveToday,
      windowStartISO: startISO,
      windowEndISO: endISO,
      workingDaysInWindow,
      weeklyTotal,
      weeklyTargetTotal,
      attainmentPct,
      statusKey: status(att),
      channelsActive,
      sparkline,
      channelTags: assignedChannels,
      commentCount: personComments.length,
      comments: personComments,
    };
  });

  // Sort by attainment desc; people with no target sort to the end.
  people.sort((a, b) => {
    if (a.attainmentPct === null && b.attainmentPct === null) return 0;
    if (a.attainmentPct === null) return 1;
    if (b.attainmentPct === null) return -1;
    return b.attainmentPct - a.attainmentPct;
  });

  const teamOutputDeltaPct =
    teamOutputLastWeek === 0
      ? null
      : Math.round(
          ((teamOutputThisWeek - teamOutputLastWeek) / teamOutputLastWeek) * 1000
        ) / 10;

  const withTarget = people.filter((p) => p.attainmentPct !== null);
  const teamAvgAttainmentPct =
    withTarget.length === 0
      ? null
      : Math.round(
          (withTarget.reduce((s, p) => s + (p.attainmentPct as number), 0) /
            withTarget.length) *
            10
        ) / 10;

  // Note: withTarget isn't re-sorted here, but `people` was already sorted by
  // attainment desc above and withTarget preserves that relative order, so
  // withTarget[0] is still the highest attainer among those with a target.
  const topPerformer =
    withTarget.length === 0
      ? null
      : {
          person: withTarget[0].person,
          attainmentPct: withTarget[0].attainmentPct as number,
        };

  const needsAttentionCount = people.filter(
    (p) => p.attainmentPct !== null && p.attainmentPct < 70
  ).length;

  return {
    people,
    missedToday,
    kpi: {
      teamOutputThisWeek,
      teamOutputLastWeek,
      teamOutputDeltaPct,
      teamAvgAttainmentPct,
      topPerformer,
      needsAttentionCount,
    },
    channelMatrix,
    isEmpty: !anyEntriesThisWeek,
  };
}

export { STATUS };
