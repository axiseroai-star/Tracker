import "server-only";

import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { CHANNELS, PEOPLE, type Channel, type Person } from "./constants";
import type { DailyLogEntry, TargetRow } from "./aggregate";

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

function isValidPerson(value: string | null): value is Person {
  return value !== null && (PEOPLE as readonly string[]).includes(value);
}

function isValidChannel(value: string | null): value is Channel {
  return value !== null && (CHANNELS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Pagination helper — Notion caps page_size at 100 per request.
// ---------------------------------------------------------------------------

type QueryFilter = NonNullable<Parameters<Client["dataSources"]["query"]>[0]>["filter"];

async function queryAllPages(
  dataSourceId: string,
  filter?: QueryFilter
): Promise<PageObjectResponse[]> {
  const results: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion().dataSources.query({
      data_source_id: dataSourceId,
      filter,
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

function mapDailyLogPage(page: PageObjectResponse): DailyLogEntry | null {
  const person = selectValue(page.properties, "Person");
  const channel = selectValue(page.properties, "Channel");
  const date = dateValue(page.properties, "Date");
  if (!isValidPerson(person) || !isValidChannel(channel) || !date) return null;
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
 * entries" table). Single paginated query, no date bound; fine at this
 * team's scale (a handful of people logging daily, not millions of rows).
 */
export async function queryAllDailyLogEntriesForAdmin(): Promise<DailyLogEntry[]> {
  const pages = await queryAllPages(DAILY_LOG_DATA_SOURCE_ID());
  return pages.map(mapDailyLogPage).filter((e): e is DailyLogEntry => e !== null);
}

export interface CreateLogInput {
  person: Person;
  channel: Channel;
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
// Targets — cached in-memory for a few minutes since these change rarely
// (edited directly in Notion by the admin, or now inline in /admin).
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
    if (!isValidPerson(person) || !isValidChannel(channel)) continue;
    rows.push({
      id: page.id,
      person,
      channel,
      dailyTarget: numberValue(page.properties, "Daily Target"),
      unit: richTextValue(page.properties, "Unit"),
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

// ---------------------------------------------------------------------------
// Comments (§13b) — admin-only feedback thread per Daily Log row.
// ---------------------------------------------------------------------------

export interface CommentEntry {
  id: string;
  comment: string;
  logEntryId: string | null;
  visibleToPerson: boolean;
  commentedAt: string | null;
}

function mapCommentPage(page: PageObjectResponse): CommentEntry {
  return {
    id: page.id,
    comment: richTextValue(page.properties, "Comment"),
    logEntryId: relationIds(page.properties, "Log Entry")[0] ?? null,
    visibleToPerson: checkboxValue(page.properties, "Visible To Person"),
    commentedAt: timestampValue(page, "Commented At"),
  };
}

/**
 * All comments with `Visible To Person` checked, dashboard-wide — used to
 * badge person cards (§13d). Comments are expected to be sparse, so this is
 * one small bulk query, not scoped per person/entry.
 */
export async function queryVisibleComments(): Promise<CommentEntry[]> {
  const pages = await queryAllPages(COMMENTS_DATA_SOURCE_ID(), {
    property: "Visible To Person",
    checkbox: { equals: true },
  });
  return pages.map(mapCommentPage);
}

/** Admin-only: every comment (visible or not) on one Daily Log row, oldest first. */
export async function queryCommentsForLogEntry(logEntryId: string): Promise<CommentEntry[]> {
  const pages = await queryAllPages(COMMENTS_DATA_SOURCE_ID(), {
    property: "Log Entry",
    relation: { contains: logEntryId },
  });
  return pages
    .map(mapCommentPage)
    .sort((a, b) => (a.commentedAt ?? "").localeCompare(b.commentedAt ?? ""));
}

export interface CreateCommentInput {
  logEntryId: string;
  comment: string;
  /** Defaults to true (§13b) — comments are feedback the person should see unless explicitly hidden. */
  visibleToPerson?: boolean;
}

export async function createComment(input: CreateCommentInput): Promise<void> {
  await notion().pages.create({
    parent: { data_source_id: COMMENTS_DATA_SOURCE_ID(), type: "data_source_id" },
    properties: {
      Comment: { rich_text: [{ text: { content: input.comment } }] },
      "Log Entry": { relation: [{ id: input.logEntryId }] },
      "Visible To Person": { checkbox: input.visibleToPerson ?? true },
    },
  });
}
