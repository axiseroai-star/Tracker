import { test } from "node:test";
import assert from "node:assert/strict";
import {
  workingDays,
  weeklyTarget,
  attainment,
  status,
  getInitials,
  rollingWindow,
  effectiveDate,
  channelsForPerson,
  allKnownChannels,
  buildTrends,
  buildChannelAverages,
  buildDashboard,
  type PersonRecord,
  type DailyLogEntry,
  type TargetRow,
} from "./aggregate";

// A small fixed roster for tests — the live app fetches this from Notion
// (§18), but aggregate.ts itself just takes whatever roster it's given.
const PR = { slackHandle: null, isAdmin: false, hasPin: true }; // shared PersonRecord filler for tests

const TEST_PEOPLE: PersonRecord[] = [
  { id: "p1", name: "Ahsan Aftab", timezone: "Europe/Berlin", active: true, ...PR },
  { id: "p2", name: "Abbas Raza", timezone: "Asia/Karachi", active: true, ...PR },
  { id: "p3", name: "Hafsa Khan", timezone: "Asia/Karachi", active: true, ...PR },
  { id: "p4", name: "Mohsin Aftab", timezone: "Asia/Karachi", active: true, ...PR },
  { id: "p5", name: "Najeeb", timezone: "Asia/Karachi", active: true, ...PR },
  { id: "p6", name: "Halima Sadia", timezone: "Asia/Karachi", active: true, ...PR },
  { id: "p7", name: "Muqadas Rajput", timezone: "Asia/Karachi", active: true, ...PR },
];

// --- workingDays -------------------------------------------------------

test("workingDays counts Mon-Fri inclusive, a Mon-Sun week has 5", () => {
  // 2026-08-03 is a Monday, 2026-08-09 is a Sunday.
  assert.equal(workingDays("2026-08-03", "2026-08-09"), 5);
});

test("workingDays over a single weekday is 1", () => {
  assert.equal(workingDays("2026-08-04", "2026-08-04"), 1); // Tuesday
});

test("workingDays over a single weekend day is 0", () => {
  assert.equal(workingDays("2026-08-08", "2026-08-08"), 0); // Saturday
});

// --- weeklyTarget / attainment / status --------------------------------

test("weeklyTarget multiplies daily target by working days", () => {
  assert.equal(weeklyTarget(20, 5), 100);
});

test("attainment is null when target is 0", () => {
  assert.equal(attainment(50, 0), null);
});

test("attainment divides actual by target", () => {
  assert.equal(attainment(80, 100), 0.8);
});

test("status: no target", () => {
  assert.equal(status(null), "NO_TARGET");
});

test("status: on track at exactly 100%", () => {
  assert.equal(status(1.0), "ON_TRACK");
});

test("status: on track above 100%", () => {
  assert.equal(status(1.4), "ON_TRACK");
});

test("status: behind at 70%", () => {
  assert.equal(status(0.7), "BEHIND");
});

test("status: behind at 99%", () => {
  assert.equal(status(0.99), "BEHIND");
});

test("status: at risk below 70%", () => {
  assert.equal(status(0.69), "AT_RISK");
});

test("status: at risk at 0", () => {
  assert.equal(status(0), "AT_RISK");
});

// --- getInitials ---------------------------------------------------------

test("getInitials uses first+last for multi-word names", () => {
  assert.equal(getInitials("Ahsan Aftab"), "AA");
  assert.equal(getInitials("Hafsa Khan"), "HK");
});

test("getInitials uses first two letters for single-word names", () => {
  assert.equal(getInitials("Najeeb"), "NA");
});

// --- rollingWindow ---------------------------------------------------------

test("rollingWindow spans 7 days ending on today, and the prior 7 before it", () => {
  const w = rollingWindow("2026-08-10");
  assert.equal(w.startISO, "2026-08-04");
  assert.equal(w.endISO, "2026-08-10");
  assert.equal(w.prevEndISO, "2026-08-03");
  assert.equal(w.prevStartISO, "2026-07-28");
});

// --- effectiveDate (§14a, now timezone-first per §18e) ----------------------
//
// Asia/Karachi is UTC+5, no DST. Europe/Berlin is UTC+2 in August (CEST).
// All instants below verified directly against date-fns-tz's
// formatInTimeZone before being hand-transcribed here.

test("effectiveDate: Karachi, just before the 5am cutoff -> previous day", () => {
  assert.equal(effectiveDate("Asia/Karachi", new Date("2026-08-09T23:30:00Z")), "2026-08-09");
});

test("effectiveDate: Karachi, exactly at the 5am cutoff -> same day", () => {
  assert.equal(effectiveDate("Asia/Karachi", new Date("2026-08-10T00:00:00Z")), "2026-08-10");
});

test("effectiveDate: Berlin (CEST, UTC+2), just before the cutoff -> previous day", () => {
  assert.equal(effectiveDate("Europe/Berlin", new Date("2026-08-10T02:30:00Z")), "2026-08-09");
});

test("effectiveDate: Berlin, exactly at the cutoff -> same day", () => {
  assert.equal(effectiveDate("Europe/Berlin", new Date("2026-08-10T03:00:00Z")), "2026-08-10");
});

test("effectiveDate: the same instant can land on different calendar days for different timezones", () => {
  const now = new Date("2026-08-10T01:00:00Z");
  // Karachi local: 06:00 (past cutoff) -> Aug 10. Berlin local: 03:00 (before cutoff) -> Aug 9.
  assert.equal(effectiveDate("Asia/Karachi", now), "2026-08-10");
  assert.equal(effectiveDate("Europe/Berlin", now), "2026-08-09");
});

function log(id: string, date: string, archived = false): DailyLogEntry {
  return { id, person: "X", channel: "Y", date, outputCount: 1, archived };
}

// --- channelsForPerson / allKnownChannels (§18b) ----------------------------

function target(id: string, person: string, channel: string, archived = false): TargetRow {
  return { id, person, channel, dailyTarget: 10, unit: "u", archived };
}

test("channelsForPerson: distinct, non-archived target channels only", () => {
  const targets = [
    target("t1", "Ahsan Aftab", "Cold Email"),
    target("t2", "Ahsan Aftab", "WhatsApp"),
    target("t3", "Ahsan Aftab", "Cold Calling", true), // archived -> excluded
    target("t4", "Abbas Raza", "Apollo"),
  ];
  assert.deepEqual(channelsForPerson("Ahsan Aftab", targets).sort(), ["Cold Email", "WhatsApp"]);
  assert.deepEqual(channelsForPerson("Abbas Raza", targets), ["Apollo"]);
  assert.deepEqual(channelsForPerson("Nobody", targets), []);
});

test("allKnownChannels: union of target (incl. archived) and log channels, sorted", () => {
  const targets = [target("t1", "A", "Zeta"), target("t2", "A", "Alpha", true)];
  const logs = [log("l1", "2026-08-01"), { ...log("l2", "2026-08-02"), channel: "Beta" }];
  assert.deepEqual(allKnownChannels(targets, logs), ["Alpha", "Beta", "Y", "Zeta"]);
});

// --- buildTrends (§16a) / buildChannelAverages (§16c) -----------------------

test("buildTrends: per-person daily series, 0-filled, oldest first", () => {
  const people: PersonRecord[] = [
    { id: "p1", name: "Ahsan Aftab", timezone: "Europe/Berlin", active: true, ...PR },
  ];
  const logs = [
    { id: "l1", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-01", outputCount: 10 },
    { id: "l2", person: "Ahsan Aftab", channel: "WhatsApp", date: "2026-08-01", outputCount: 5 },
    { id: "l3", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-03", outputCount: 7 },
  ];
  const trends = buildTrends({ people, logs, startISO: "2026-08-01", endISO: "2026-08-03" });
  assert.equal(trends.length, 1);
  assert.equal(trends[0].total, 22);
  assert.deepEqual(trends[0].daily, [
    { date: "2026-08-01", total: 15 },
    { date: "2026-08-02", total: 0 },
    { date: "2026-08-03", total: 7 },
  ]);
});

test("buildTrends: archived entries are excluded", () => {
  const people: PersonRecord[] = [
    { id: "p1", name: "A", timezone: "UTC", active: true, ...PR },
  ];
  const logs = [
    { id: "l1", person: "A", channel: "X", date: "2026-08-01", outputCount: 10, archived: true },
  ];
  const trends = buildTrends({ people, logs, startISO: "2026-08-01", endISO: "2026-08-01" });
  assert.equal(trends[0].total, 0);
});

test("buildChannelAverages: average daily output per person/channel over the window", () => {
  const logs: DailyLogEntry[] = [
    { id: "l1", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-01", outputCount: 20 },
    { id: "l2", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-02", outputCount: 10 },
    { id: "l3", person: "Ahsan Aftab", channel: "WhatsApp", date: "2026-08-02", outputCount: 6 },
  ];
  const averages = buildChannelAverages({ logs, startISO: "2026-08-01", endISO: "2026-08-02" });
  // Cold Email: (20+10)/2 days = 15; WhatsApp: 6/2 days = 3.
  assert.equal(averages["Ahsan Aftab"]["Cold Email"], 15);
  assert.equal(averages["Ahsan Aftab"]["WhatsApp"], 3);
});

// --- buildDashboard (hand-computed example) --------------------------------

test("buildDashboard: channelsActive, weekly totals, attainment, missedToday", () => {
  // Noon UTC on 2026-08-10 (a Monday) is safely past the cutoff in both
  // Karachi and Berlin, so everyone's effectiveToday is 2026-08-10 and the
  // window is 2026-08-04..2026-08-10 (5 working days).
  const now = new Date("2026-08-10T12:00:00Z");
  const result = buildDashboard({
    now,
    people: TEST_PEOPLE,
    targets: [
      target("t1", "Ahsan Aftab", "Cold Email"),
      target("t2", "Ahsan Aftab", "WhatsApp"),
    ],
    logs: [
      // Ahsan logs Cold Email on 4 days this week, WhatsApp on 1 day.
      { id: "l1", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-04", outputCount: 25 },
      { id: "l2", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-08", outputCount: 25 },
      { id: "l3", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-09", outputCount: 25 },
      { id: "l4", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-10", outputCount: 25 },
      { id: "l5", person: "Ahsan Aftab", channel: "WhatsApp", date: "2026-08-10", outputCount: 5 },
    ],
    comments: [
      { id: "c1", logEntryId: "l1", author: "Admin", comment: "Great open rate this batch.", commentedAt: "2026-08-05T09:00:00.000Z" },
      { id: "c2", logEntryId: "l4", author: "Admin", comment: "Follow up with the Texas leads.", commentedAt: "2026-08-10T12:00:00.000Z" },
      { id: "c3", logEntryId: "does-not-exist", author: "Admin", comment: "Orphaned comment.", commentedAt: "2026-08-06T09:00:00.000Z" },
    ],
  });

  const ahsan = result.people.find((p) => p.person === "Ahsan Aftab")!;

  // weeklyTargetTotal = (10*5) + (10*5) = 100 (both fixtures use dailyTarget: 10, see `target()` helper)
  assert.equal(ahsan.weeklyTargetTotal, 100);
  // weeklyTotal = 25+25+25+25+5 = 105
  assert.equal(ahsan.weeklyTotal, 105);
  assert.equal(ahsan.statusKey, "ON_TRACK");
  // channelsActive = Cold Email + WhatsApp = 2
  assert.equal(ahsan.channelsActive, 2);

  // Ahsan logged today (2026-08-10), so he should not be in missedToday.
  assert.ok(!result.missedToday.includes("Ahsan Aftab"));
  // Everyone else has zero logs -> all missed today, and all have no target rows -> NO_TARGET.
  assert.ok(result.missedToday.includes("Abbas Raza"));
  const abbas = result.people.find((p) => p.person === "Abbas Raza")!;
  assert.equal(abbas.statusKey, "NO_TARGET");
  assert.equal(abbas.attainmentPct, null);

  assert.equal(result.kpi.teamOutputThisWeek, 105);
  assert.equal(result.isEmpty, false);

  // Two comments landed on Ahsan's entries (l1, l4); one pointed at an id
  // that doesn't exist in `logs` and is silently ignored, not miscounted.
  assert.equal(ahsan.commentCount, 2);
  assert.equal(ahsan.comments.length, 2);
  assert.equal(abbas.commentCount, 0);
  assert.deepEqual(abbas.comments, []);

  // Resolved to their entry's channel/date/logEntryId, newest commentedAt first.
  assert.equal(ahsan.comments[0].comment, "Follow up with the Texas leads.");
  assert.equal(ahsan.comments[0].channel, "Cold Email");
  assert.equal(ahsan.comments[0].date, "2026-08-10");
  assert.equal(ahsan.comments[0].logEntryId, "l4");
  assert.equal(ahsan.comments[1].comment, "Great open rate this batch.");
  assert.equal(ahsan.comments[1].date, "2026-08-04");
});

test("buildDashboard: isEmpty is true when there are no logs in the window", () => {
  const result = buildDashboard({
    now: new Date("2026-08-10T12:00:00Z"),
    people: TEST_PEOPLE,
    targets: [],
    logs: [],
  });
  assert.equal(result.isEmpty, true);
  assert.equal(result.kpi.teamOutputThisWeek, 0);
  assert.equal(result.missedToday.length, 7);
});

test("buildDashboard: only the given (e.g. Active) roster is aggregated", () => {
  const result = buildDashboard({
    now: new Date("2026-08-10T12:00:00Z"),
    people: TEST_PEOPLE.slice(0, 2), // just Ahsan + Abbas
    targets: [],
    logs: [],
  });
  assert.equal(result.people.length, 2);
  assert.equal(result.missedToday.length, 2);
});

test("buildDashboard: each person's window/effectiveToday is computed in their own timezone (§14c)", () => {
  // At this instant Karachi has already rolled over to Aug 10 (06:00 local,
  // past the cutoff), but Berlin hasn't crossed the 5am cutoff yet (03:00
  // local) -> Ahsan's effective "today" is still Aug 9.
  const now = new Date("2026-08-10T01:00:00Z");
  const result = buildDashboard({
    now,
    people: TEST_PEOPLE,
    targets: [],
    logs: [
      // Ahsan logged on what IS his own effective today (Aug 9, Berlin time).
      { id: "a1", person: "Ahsan Aftab", channel: "Cold Email", date: "2026-08-09", outputCount: 10 },
    ],
  });

  const ahsan = result.people.find((p) => p.person === "Ahsan Aftab")!;
  const abbas = result.people.find((p) => p.person === "Abbas Raza")!;

  assert.equal(ahsan.effectiveToday, "2026-08-09");
  assert.equal(abbas.effectiveToday, "2026-08-10");
  assert.equal(ahsan.windowEndISO, "2026-08-09");
  assert.equal(abbas.windowEndISO, "2026-08-10");

  // Ahsan logged on his own effective today -> not missed, even though it's
  // a different calendar date than Abbas's.
  assert.ok(!result.missedToday.includes("Ahsan Aftab"));
  // Abbas has zero logs at all -> missed against his own (later-rolled) today.
  assert.ok(result.missedToday.includes("Abbas Raza"));
});
