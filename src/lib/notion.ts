import "server-only";

import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { DailyLogEntry, PersonRecord, TargetRow } from "./aggregate";

/**
 * NOTION_TOKEN is read here, and only here (plus route handlers that import
 * this module). This file is never imported from a "use client" component —
 * `server-only` throws a build error if that ever happens by accident.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let client: Client | null = null;
function notion(): Client {
  if (!client) {
    client = new Client({ auth: requireEnv("NOTION_TOKEN") });
  }
  return client;
}

const TARGETS_DATA_SOURCE_ID = () => requireEnv("NOTION_TARGETS_DATA_SOURCE_ID");
const DAILY_LOG_DATA_SOURCE_ID = () => requireEnv("NOTION_DAILY_LOG_DATA_SOURCE_ID");
const COMMENTS_DATA_SOURCE_ID = () => requireEnv("NOTION_COMMENTS_DATA_SOURCE_ID");
const PEOPLE_DATA_SOURCE_ID = () => requireEnv("NOTION_PEOPLE_DATA_SOURCE_ID");

// ---------------------------------------------------------------------------
// Property extraction helpers — tolerant of a select/number/date coming back
// empty (e.g. a row someone half-filled in Notion directly).
// ---------------------------------------------------------------------------

type Props = PageObjectResponse["properties"];

function selectValue(props: Props, key: string): string | null {
  const prop = props[key];
  if (!prop || prop.type !== "select") return null;
  return prop.select?.name ?? null;
}

function numberValue(props: Props, key: string): number {
  const prop = props[key];
  if (!prop || prop.type !== "number") return 0;
  return prop.number ?? 0;
}

function dateValue(props: Props, key: string): string | null {
  const prop = props[key];
  if (!prop || prop.type !== "date") return null;
  return prop.date?.start?.slice(0, 10) ?? null;
}

function richTextValue(props: Props, key: string): string {
  const prop = props[key];
  if (!prop || prop.type !== "rich_text") return "";
  return prop.rich_text.map((t) => t.plain_text).join("");
}

function titleValue(props: Props, key: string): string {
  const prop = props[key];
  if (!prop || prop.type !== "title") return "";
  return prop.title.map((t) => t.plain_text).join("");
}

function checkboxValue(props: Props, key: string): boolean {
  const prop = props[key];
  if (!prop || prop.type !== "checkbox") return false;
  return prop.checkbox;
}

function relationIds(props: Props, key: string): string[] {
  const prop = props[key];
  if (!prop || prop.type !== "relation") return [];
  return prop.relation.map((r) => r.id);
}

/** "Commented At" is documented as auto-populated — read whichever timestamp shape it turns out to be. */
function timestampValue(page: PageObjectResponse, key: string): string | null {
  const prop = page.properties[key];
  if (prop?.type === "created_time") return prop.created_time;
  if (prop?.type === "date") return prop.date?.start ?? null;
  return page.created_time ?? null;
}

// Person/Channel are open string sets now (§18) — Notion select values are
// trusted as-is rather than checked against a hardcoded roster/list. Just
// guard against genuinely empty values.
function isNonEmpty(value: string | null): value is string {
  return value !== null && value.length > 0;
}

// ---------------------------------------------------------------------------
// Pagination helper — Notion caps page_size at 100 per request.
// ---------------------------------------------------------------------------

type QueryFilter = NonNullable<Parameters<Client["dataSources"]["query"]>[0]>["filter"];
type QuerySort = NonNullable<Parameters<Client["dataSources"]["query"]>[0]>["sorts"];

async function queryAllPages(
  dataSourceId: string,
  filter?: QueryFilter,
  sorts?: QuerySort
): Promise<PageObjectResponse[]> {
  const results: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion().dataSources.query({
      data_source_id: dataSourceId,
      filter,
      sorts,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of response.results) {
      if (page.object === "page" && "properties" in page) {
        results.push(page as PageObjectResponse);
      }
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

/**
 * Add a select option to a property if it doesn't already exist (§18d) —
 * used when a new team member is created, so their name is immediately a
 * valid `Person`/`Author` option on Targets, Daily Log, and Comments rather
 * than waiting on (and trusting) Notion's implicit auto-create-on-write.
 */
async function ensureSelectOption(
  dataSourceId: string,
  propertyName: string,
  optionName: string
): Promise<void> {
  const ds = await notion().dataSources.retrieve({ data_source_id: dataSourceId });
  const prop = ds.properties[propertyName];
  if (!prop || prop.type !== "select") return;
  if (prop.select.options.some((o) => o.name === optionName)) return;

  await notion().dataSources.update({
    data_source_id: dataSourceId,
    properties: {
      [propertyName]: {
        select: {
          options: [...prop.select.options.map((o) => ({ name: o.name, color: o.color })), { name: optionName }],
        },
      },
    },
  });
}

/** Make `name` a valid Person/Author option everywhere it's needed (§18d). */
export async function ensurePersonOptionEverywhere(name: string): Promise<void> {
  await Promise.all([
    ensureSelectOption(TARGETS_DATA_SOURCE_ID(), "Person", name),
    ensureSelectOption(DAILY_LOG_DATA_SOURCE_ID(), "Person", name),
    ensureSelectOption(COMMENTS_DATA_SOURCE_ID(), "Author", name),
  ]);
}

function mapDailyLogPage(page: PageObjectResponse): DailyLogEntry | null {
  const person = selectValue(page.properties, "Person");
  const channel = selectValue(page.properties, "Channel");
  const date = dateValue(page.properties, "Date");
  if (!isNonEmpty(person) || !isNonEmpty(channel) || !date) return null;
  return {
    id: page.id,
    person,
    channel,
    date,
    outputCount: numberValue(page.properties, "Output Count"),
    notes: richTextValue(page.properties, "Notes"),
    archived: checkboxValue(page.properties, "Archived"),
    flagged: checkboxValue(page.properties, "Flagged"),
  };
}

// ---------------------------------------------------------------------------
// Daily Log
// ---------------------------------------------------------------------------

/**
 * One Notion query, filtered to a date range and excluding archived rows
 * (§13b: "Archived" must be filtered out everywhere the dashboard reads
 * Daily Log). Never call this per-person/per-channel.
 */
export async function queryDailyLogByDateRange(
  startISO: string,
  endISO: string
): Promise<DailyLogEntry[]> {
  const pages = await queryAllPages(DAILY_LOG_DATA_SOURCE_ID(), {
    and: [
      { property: "Date", date: { on_or_after: startISO } },
      { property: "Date", date: { on_or_before: endISO } },
      { property: "Archived", checkbox: { equals: false } },
    ],
  });

  return pages.map(mapDailyLogPage).filter((e): e is DailyLogEntry => e !== null);
}

/**
 * Full Daily Log history, including archived rows — admin-only (§13c "all
 * entries" table) and the CSV backup (§16e). Single paginated query, no date
 * bound; fine at this team's scale (a handful of people logging daily, not
 * millions of rows).
 */
export async function queryAllDailyLogEntriesForAdmin(): Promise<DailyLogEntry[]> {
  const pages = await queryAllPages(DAILY_LOG_DATA_SOURCE_ID());
  return pages.map(mapDailyLogPage).filter((e): e is DailyLogEntry => e !== null);
}

export interface CreateLogInput {
  person: string;
  channel: string;
  date: string; // YYYY-MM-DD
  outputCount: number;
  notes?: string;
}

export async function createDailyLogEntry(input: CreateLogInput): Promise<void> {
  const title = `${input.person} — ${input.channel} — ${input.date}`;
  await notion().pages.create({
    parent: { data_source_id: DAILY_LOG_DATA_SOURCE_ID(), type: "data_source_id" },
    properties: {
      Name: { title: [{ text: { content: title } }] },
      Person: { select: { name: input.person } },
      Channel: { select: { name: input.channel } },
      Date: { date: { start: input.date } },
      "Output Count": { number: input.outputCount },
      Notes: input.notes
        ? { rich_text: [{ text: { content: input.notes } }] }
        : { rich_text: [] },
      Archived: { checkbox: false },
      Flagged: { checkbox: false },
    },
  });
}

/** Admin-only: flip Archived and/or Flagged on one row. Never a hard delete (§13c). */
export async function updateDailyLogFlags(
  pageId: string,
  patch: { archived?: boolean; flagged?: boolean }
): Promise<void> {
  const properties: Record<string, { checkbox: boolean }> = {};
  if (patch.archived !== undefined) properties.Archived = { checkbox: patch.archived };
  if (patch.flagged !== undefined) properties.Flagged = { checkbox: patch.flagged };
  if (Object.keys(properties).length === 0) return;

  await notion().pages.update({ page_id: pageId, properties });
}

// ---------------------------------------------------------------------------
// Targets — cached in-memory for a few minutes since these change rarely.
// Each row now also carries `archived` (§18c) — archived rows drop out of
// /log's channel options and the dashboard, but the row itself stays intact.
// ---------------------------------------------------------------------------

const TARGETS_CACHE_TTL_MS = 5 * 60 * 1000;
let targetsCache: { data: TargetRow[]; fetchedAt: number } | null = null;

export async function queryAllTargets(): Promise<TargetRow[]> {
  if (targetsCache && Date.now() - targetsCache.fetchedAt < TARGETS_CACHE_TTL_MS) {
    return targetsCache.data;
  }

  const pages = await queryAllPages(TARGETS_DATA_SOURCE_ID());
  const rows: TargetRow[] = [];
  for (const page of pages) {
    const person = selectValue(page.properties, "Person");
    const channel = selectValue(page.properties, "Channel");
    if (!isNonEmpty(person) || !isNonEmpty(channel)) continue;
    rows.push({
      id: page.id,
      person,
      channel,
      dailyTarget: numberValue(page.properties, "Daily Target"),
      unit: richTextValue(page.properties, "Unit"),
      archived: checkboxValue(page.properties, "Archived"),
    });
  }

  targetsCache = { data: rows, fetchedAt: Date.now() };
  return rows;
}

/** Bust the in-memory targets cache — call after any write so the next read isn't stale. */
export function clearTargetsCache(): void {
  targetsCache = null;
}

/** Admin-only inline editing (§13c) — PATCH the Daily Target number directly. */
export async function updateTargetDailyTarget(pageId: string, dailyTarget: number): Promise<void> {
  await notion().pages.update({
    page_id: pageId,
    properties: { "Daily Target": { number: dailyTarget } },
  });
  clearTargetsCache();
}

/** Admin-only (§18c) — archive/restore a responsibility. Never deletes the row. */
export async function updateTargetArchived(pageId: string, archived: boolean): Promise<void> {
  await notion().pages.update({
    page_id: pageId,
    properties: { Archived: { checkbox: archived } },
  });
  clearTargetsCache();
}

export interface CreateTargetInput {
  person: string;
  channel: string;
  dailyTarget: number;
  unit: string;
}

/** Admin-only (§18c) — "add a responsibility": a new Person x Channel row. */
export async function createTargetRow(input: CreateTargetInput): Promise<void> {
  const title = `${input.person} — ${input.channel}`;
  await notion().pages.create({
    parent: { data_source_id: TARGETS_DATA_SOURCE_ID(), type: "data_source_id" },
    properties: {
      Name: { title: [{ text: { content: title } }] },
      Person: { select: { name: input.person } },
      Channel: { select: { name: input.channel } },
      "Daily Target": { number: input.dailyTarget },
      Unit: { rich_text: [{ text: { content: input.unit } }] },
      Archived: { checkbox: false },
    },
  });
  clearTargetsCache();
}

// ---------------------------------------------------------------------------
// Comments (§13b, extended by §16d) — feedback thread per Daily Log row,
// now two-way: admin comments + member replies, tagged by Author.
// ---------------------------------------------------------------------------

export interface CommentEntry {
  id: string;
  comment: string;
  logEntryId: string | null;
  author: string | null; // a person's name, or "Admin"
  visibleToPerson: boolean;
  commentedAt: string | null;
}

function mapCommentPage(page: PageObjectResponse): CommentEntry {
  return {
    id: page.id,
    comment: richTextValue(page.properties, "Comment"),
    logEntryId: relationIds(page.properties, "Log Entry")[0] ?? null,
    author: selectValue(page.properties, "Author"),
    visibleToPerson: checkboxValue(page.properties, "Visible To Person"),
    commentedAt: timestampValue(page, "Commented At"),
  };
}

/**
 * All comments with `Visible To Person` checked, dashboard-wide — used to
 * badge person cards and seed the member-facing thread (§13d/§16d). Comments
 * are expected to be sparse, so this is one small bulk query, not scoped per
 * person/entry.
 */
export async function queryVisibleComments(): Promise<CommentEntry[]> {
  const pages = await queryAllPages(COMMENTS_DATA_SOURCE_ID(), {
    property: "Visible To Person",
    checkbox: { equals: true },
  });
  return pages.map(mapCommentPage);
}

/** Every comment (visible or not) on one Daily Log row, chronological — admin panel. */
export async function queryCommentsForLogEntry(logEntryId: string): Promise<CommentEntry[]> {
  const pages = await queryAllPages(COMMENTS_DATA_SOURCE_ID(), {
    property: "Log Entry",
    relation: { contains: logEntryId },
  });
  return pages
    .map(mapCommentPage)
    .sort((a, b) => (a.commentedAt ?? "").localeCompare(b.commentedAt ?? ""));
}

/** Only the visible comments on one row, chronological — member-facing thread refresh. */
export async function queryVisibleCommentsForLogEntry(logEntryId: string): Promise<CommentEntry[]> {
  const all = await queryCommentsForLogEntry(logEntryId);
  return all.filter((c) => c.visibleToPerson);
}

export async function queryCommentById(id: string): Promise<CommentEntry | null> {
  const page = await notion().pages.retrieve({ page_id: id });
  if (!("properties" in page)) return null;
  return mapCommentPage(page as PageObjectResponse);
}

export interface CreateCommentInput {
  logEntryId: string;
  comment: string;
  /** A person's name, or "Admin" for admin-authored top-level comments. */
  author: string;
  /** Defaults to true (§13b) — comments/replies are feedback the person should see unless explicitly hidden. */
  visibleToPerson?: boolean;
}

export async function createComment(input: CreateCommentInput): Promise<void> {
  await notion().pages.create({
    parent: { data_source_id: COMMENTS_DATA_SOURCE_ID(), type: "data_source_id" },
    properties: {
      Comment: { rich_text: [{ text: { content: input.comment } }] },
      "Log Entry": { relation: [{ id: input.logEntryId }] },
      Author: { select: { name: input.author } },
      "Visible To Person": { checkbox: input.visibleToPerson ?? true },
    },
  });
}

/** §16d edit — admin (any) or the comment's own Author (self-reported "acting as", see route for the check). */
export async function updateComment(
  id: string,
  patch: { comment?: string; visibleToPerson?: boolean }
): Promise<void> {
  type CommentProps = NonNullable<Parameters<Client["pages"]["update"]>[0]["properties"]>;
  const properties: CommentProps = {};
  if (patch.comment !== undefined) {
    properties.Comment = { rich_text: [{ text: { content: patch.comment } }] };
  }
  if (patch.visibleToPerson !== undefined) {
    properties["Visible To Person"] = { checkbox: patch.visibleToPerson };
  }
  if (Object.keys(properties).length === 0) return;
  await notion().pages.update({ page_id: id, properties });
}

/** §16d delete — soft-delete via Notion's trash (recoverable there), not a schema-level hard delete. */
export async function deleteComment(id: string): Promise<void> {
  await notion().pages.update({ page_id: id, in_trash: true });
}

// ---------------------------------------------------------------------------
// People (§18a) — replaces the hardcoded PEOPLE/PERSON_TIMEZONES constants.
// Cached the same way Targets is.
// ---------------------------------------------------------------------------

const PEOPLE_CACHE_TTL_MS = 5 * 60 * 1000;
let peopleCache: { data: PersonRecord[]; fetchedAt: number } | null = null;

/** Every row, active and inactive — admin's Team view needs both. */
export async function queryAllPeople(): Promise<PersonRecord[]> {
  if (peopleCache && Date.now() - peopleCache.fetchedAt < PEOPLE_CACHE_TTL_MS) {
    return peopleCache.data;
  }

  const pages = await queryAllPages(PEOPLE_DATA_SOURCE_ID());
  const rows: PersonRecord[] = [];
  for (const page of pages) {
    const name = titleValue(page.properties, "Name");
    const timezone = richTextValue(page.properties, "Timezone");
    if (!name || !timezone) continue; // half-filled row directly in Notion — skip rather than crash
    const slackHandle = richTextValue(page.properties, "Slack Handle");
    rows.push({
      id: page.id,
      name,
      timezone,
      active: checkboxValue(page.properties, "Active"),
      slackHandle: slackHandle || null,
    });
  }

  peopleCache = { data: rows, fetchedAt: Date.now() };
  return rows;
}

export function clearPeopleCache(): void {
  peopleCache = null;
}

export interface CreatePersonInput {
  name: string;
  timezone: string;
}

/** Admin-only (§18d) — "add a team member". Ensures the name is a valid Person/Author option everywhere. */
export async function createPerson(input: CreatePersonInput): Promise<void> {
  await notion().pages.create({
    parent: { data_source_id: PEOPLE_DATA_SOURCE_ID(), type: "data_source_id" },
    properties: {
      Name: { title: [{ text: { content: input.name } }] },
      Timezone: { rich_text: [{ text: { content: input.timezone } }] },
      Active: { checkbox: true },
    },
  });
  clearPeopleCache();
  await ensurePersonOptionEverywhere(input.name);
}

/** Admin-only (§18d) — toggle Active or edit Timezone. Never deletes the row. */
export async function updatePerson(
  id: string,
  patch: { active?: boolean; timezone?: string }
): Promise<void> {
  type PersonProps = NonNullable<Parameters<Client["pages"]["update"]>[0]["properties"]>;
  const properties: PersonProps = {};
  if (patch.active !== undefined) properties.Active = { checkbox: patch.active };
  if (patch.timezone !== undefined) {
    properties.Timezone = { rich_text: [{ text: { content: patch.timezone } }] };
  }
  if (Object.keys(properties).length === 0) return;
  await notion().pages.update({ page_id: id, properties });
  clearPeopleCache();
}
