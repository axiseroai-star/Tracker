import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { effectiveDate } from "./aggregate";
import type { PipelineOutcome, PipelineSource, PipelineStatus } from "./pipeline-constants";

/**
 * Sales Pipeline (leads/touches) — Postgres via Neon's HTTP driver, the same
 * role lib/notion.ts plays for the Daily Log: the only file that touches
 * DATABASE_URL directly, and every read/write goes through here. Never
 * imported from a "use client" component — `server-only` enforces that.
 *
 * Separate schema/table pair from the Notion-backed Daily Log — nothing here
 * reads or writes Notion, and nothing in lib/notion.ts is touched.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type SqlClient = NeonQueryFunction<false, false>;
let sqlClient: SqlClient | null = null;
function sql(): SqlClient {
  if (!sqlClient) {
    sqlClient = neon<false, false>(requireEnv("DATABASE_URL"));
  }
  return sqlClient;
}

// ---------------------------------------------------------------------------
// Schema — idempotent, memoized per warm process. Every exported query/write
// below calls this first, so there's no separate migration step to remember.
// ---------------------------------------------------------------------------

let schemaReady: Promise<void> | null = null;

export function ensurePipelineSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const q = sql();
      await q`
        CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          proof_link TEXT NOT NULL,
          contact_channel TEXT NOT NULL,
          contact_info TEXT NOT NULL,
          notes TEXT,
          owner TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'New',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // Soft-delete (§ "Delete option"): an archived lead keeps its row —
      // preserving the proof/audit trail is the point of this feature, so
      // there is no DELETE statement anywhere for leads or touches.
      // NULL = active, a timestamp = archived.
      await q`ALTER TABLE leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
      await q`
        CREATE TABLE IF NOT EXISTS touches (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER NOT NULL REFERENCES leads(id),
          bd_person TEXT NOT NULL,
          date DATE NOT NULL,
          outcome TEXT NOT NULL,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (lead_id, date)
        )
      `;
      // Same-day touches are now upserted (one row per lead per day, revisable
      // until midnight) instead of insert-once-then-blocked — this tracks
      // when that row was last revised, separately from created_at.
      await q`ALTER TABLE touches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
    })();
  }
  return schemaReady;
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface Lead {
  id: number;
  name: string;
  source: PipelineSource;
  proofLink: string;
  contactChannel: string;
  contactInfo: string;
  notes: string | null;
  owner: string;
  status: PipelineStatus;
  createdAt: string;
  updatedAt: string;
  /** null = active; a timestamp = archived (soft-deleted). Never hard-deleted. */
  archivedAt: string | null;
}

export interface Touch {
  id: number;
  leadId: number;
  bdPerson: string;
  date: string; // YYYY-MM-DD
  outcome: PipelineOutcome;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The neon serverless driver parses TIMESTAMPTZ columns into real JS `Date`
 * objects (same reason `touches.date` needs its own to_char() cast — see
 * TOUCH_COLUMNS below). A plain `NextResponse.json()` round-trip silently
 * fixes this (JSON.stringify calls Date#toJSON internally), which is why
 * this went unnoticed — but leads/touches are also handed to client
 * components directly as Server Component props (see /pipeline's page.tsx),
 * and that RSC serialization path preserves `Date` as `Date`, not string.
 * Every Lead/Touch field typed `string` here must actually *be* a string
 * before it leaves this module, regardless of which path it exits through.
 */
function toISOString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLeadRow(row: any): Lead {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    proofLink: row.proof_link,
    contactChannel: row.contact_channel,
    contactInfo: row.contact_info,
    notes: row.notes,
    owner: row.owner,
    status: row.status,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
    archivedAt: row.archived_at === null ? null : toISOString(row.archived_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTouchRow(row: any): Touch {
  return {
    id: row.id,
    leadId: row.lead_id,
    bdPerson: row.bd_person,
    date: row.date,
    outcome: row.outcome,
    notes: row.notes,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every active (non-archived) lead, newest first — any authenticated
 * session may read this (rule §2). Archived leads are excluded here, not
 * filtered after the fact, so they simply never reach the board (rule §5 of
 * the delete feature) — there is no separate "list archived" query since
 * nothing in this feature restores or displays archived leads.
 */
export async function listLeads(): Promise<Lead[]> {
  await ensurePipelineSchema();
  const rows = await sql()`SELECT * FROM leads WHERE archived_at IS NULL ORDER BY created_at DESC`;
  return rows.map(mapLeadRow);
}

// The driver parses SQL DATE columns into JS Date objects constructed in the
// server process's *local* timezone, which makes a later toISOString()-style
// read-back timezone-dependent and liable to land on the wrong calendar day.
// Every query touching `touches.date` selects it pre-formatted as text
// instead, so what comes back is always the exact YYYY-MM-DD stored.
const TOUCH_COLUMNS =
  "id, lead_id, bd_person, to_char(date, 'YYYY-MM-DD') AS date, outcome, notes, created_at, updated_at";

/** Every touch — small table at this team's scale, fetched whole and filtered in memory by the caller. */
export async function listTouches(): Promise<Touch[]> {
  await ensurePipelineSchema();
  const rows = await sql()`SELECT ${sql().unsafe(TOUCH_COLUMNS)} FROM touches ORDER BY date DESC`;
  return rows.map(mapTouchRow);
}

export async function getLeadById(id: number): Promise<Lead | null> {
  await ensurePipelineSchema();
  const rows = await sql()`SELECT * FROM leads WHERE id = ${id}`;
  return rows[0] ? mapLeadRow(rows[0]) : null;
}

export interface LeadWithTouchToday extends Lead {
  hasTouchToday: boolean;
  /** The lead's touch row for today, if any — lets the UI pre-fill/revise it (same-day touches are now editable). */
  touchToday: Touch | null;
  /** Most recent touch date across all history (YYYY-MM-DD), or null if never touched — for "days since last touch" displays. */
  lastTouchDate: string | null;
}

/**
 * Annotates each lead with today's touch (if any), for its *owner's* "today"
 * — only the owner (or an admin acting for them) can ever touch a lead, so
 * that's whose day a touch would be filed under (rule §1). Pure/no I/O, so
 * both GET /api/pipeline/leads and the /pipeline page (which fetches leads
 * server-side directly, without going through the API route) share one
 * implementation instead of two that could drift.
 */
export function attachHasTouchToday(
  leads: Lead[],
  touches: Touch[],
  timezoneByPerson: Map<string, string>
): LeadWithTouchToday[] {
  const touchesByLead = new Map<number, Touch[]>();
  for (const touch of touches) {
    const list = touchesByLead.get(touch.leadId) ?? [];
    list.push(touch);
    touchesByLead.set(touch.leadId, list);
  }

  return leads.map((lead) => {
    const ownerTimezone = timezoneByPerson.get(lead.owner);
    const ownerToday = ownerTimezone ? effectiveDate(ownerTimezone) : null;
    const leadTouches = touchesByLead.get(lead.id) ?? [];
    // One row per (lead_id, date): at most one touch can ever match today,
    // however many times it's been revised — same-day updates never create
    // a second row, so this can't inflate into more than one match.
    const touchToday =
      (ownerToday !== null && leadTouches.find((t) => t.date === ownerToday)) || null;
    const lastTouchDate = leadTouches.reduce<string | null>(
      (latest, t) => (latest === null || t.date > latest ? t.date : latest),
      null
    );
    return { ...lead, hasTouchToday: touchToday !== null, touchToday, lastTouchDate };
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  name: string;
  source: PipelineSource;
  proofLink: string;
  contactChannel: string;
  contactInfo: string;
  notes?: string;
  owner: string;
}

/** Lead created → status = 'New'. */
export async function createLead(input: CreateLeadInput): Promise<Lead> {
  await ensurePipelineSchema();
  const rows = await sql()`
    INSERT INTO leads (name, source, proof_link, contact_channel, contact_info, notes, owner, status)
    VALUES (
      ${input.name},
      ${input.source},
      ${input.proofLink},
      ${input.contactChannel},
      ${input.contactInfo},
      ${input.notes ?? null},
      ${input.owner},
      'New'
    )
    RETURNING *
  `;
  return mapLeadRow(rows[0]);
}

/** Admin-only "take over" — status → Handed Off, a terminal state. Caller enforces the admin check. */
export async function takeOverLead(id: number): Promise<Lead | null> {
  await ensurePipelineSchema();
  const rows = await sql()`
    UPDATE leads SET status = 'Handed Off', updated_at = now() WHERE id = ${id} RETURNING *
  `;
  return rows[0] ? mapLeadRow(rows[0]) : null;
}

/**
 * Soft-delete — sets archived_at, never removes the row (owner/admin only,
 * caller enforces via requireOwnerOrAdmin). Allowed regardless of the
 * lead's current status: this is for fixing mistakes, not a stage
 * transition, so it doesn't go through nextStatusForOutcome() at all.
 */
export async function archiveLead(id: number): Promise<Lead | null> {
  await ensurePipelineSchema();
  const rows = await sql()`
    UPDATE leads SET archived_at = now(), updated_at = now() WHERE id = ${id} RETURNING *
  `;
  return rows[0] ? mapLeadRow(rows[0]) : null;
}

export interface CreateTouchInput {
  leadId: number;
  bdPerson: string;
  date: string; // YYYY-MM-DD, always server-computed by the caller via effectiveDate()
  outcome: PipelineOutcome;
  notes?: string;
}

/**
 * Status auto-update logic:
 * - An outcome that maps to a stage of its own (Replied/Interested/Not
 *   Interested) always wins, first touch or not.
 * - Otherwise (No Reply / Went to Spam), the first touch on a lead advances
 *   it New -> Contacted; a later touch with one of these outcomes leaves the
 *   status as-is (no defined mapping, so no change).
 */
function nextStatusForOutcome(
  currentStatus: PipelineStatus,
  isFirstTouch: boolean,
  outcome: PipelineOutcome
): PipelineStatus {
  if (outcome === "Replied") return "Replied";
  if (outcome === "Interested") return "Interested";
  if (outcome === "Not Interested") return "Not Interested";
  return isFirstTouch ? "Contacted" : currentStatus;
}

/**
 * Creates or revises today's touch and applies the resulting status update
 * in the same call. One row per (lead_id, date) (rule §3): a second
 * submission for the same lead on the same day upserts the existing row's
 * outcome/notes/updated_at via ON CONFLICT (lead_id, date) DO UPDATE instead
 * of being rejected — a later day still inserts a fresh row as before.
 *
 * Ownership, terminal-status, and channel checks are the caller's
 * responsibility (see /api/pipeline/touches) — this function only encodes
 * the parts of the business rules that must live next to the write itself.
 */
export async function createTouch(input: CreateTouchInput): Promise<{ touch: Touch; lead: Lead }> {
  await ensurePipelineSchema();
  const q = sql();

  // `date` is known already (it's `input.date`, server-computed by the
  // caller), so RETURNING skips it — sidesteps the DATE-column read-back
  // timezone issue entirely rather than needing a to_char() cast here too.
  const upsertedRows = await q`
    INSERT INTO touches (lead_id, bd_person, date, outcome, notes)
    VALUES (${input.leadId}, ${input.bdPerson}, ${input.date}, ${input.outcome}, ${input.notes ?? null})
    ON CONFLICT (lead_id, date) DO UPDATE SET
      outcome = EXCLUDED.outcome,
      notes = EXCLUDED.notes,
      updated_at = now()
    RETURNING id, created_at, updated_at
  `;
  const touch: Touch = {
    id: upsertedRows[0].id,
    leadId: input.leadId,
    bdPerson: input.bdPerson,
    date: input.date,
    outcome: input.outcome,
    notes: input.notes ?? null,
    createdAt: toISOString(upsertedRows[0].created_at),
    updatedAt: toISOString(upsertedRows[0].updated_at),
  };

  // Still one row per (lead_id, date) after the upsert — a same-day revision
  // updates this count's existing row rather than adding to it, so this
  // stays an accurate "first touch ever" check on both the insert and
  // same-day update paths.
  const countRows = await q`
    SELECT COUNT(*)::int AS count FROM touches WHERE lead_id = ${input.leadId}
  `;
  const isFirstTouch = Number(countRows[0]?.count ?? 0) <= 1;

  const leadRows = await q`SELECT * FROM leads WHERE id = ${input.leadId}`;
  const currentLead = mapLeadRow(leadRows[0]);
  const nextStatus = nextStatusForOutcome(currentLead.status, isFirstTouch, input.outcome);

  let lead = currentLead;
  if (nextStatus !== currentLead.status) {
    const updatedRows = await q`
      UPDATE leads SET status = ${nextStatus}, updated_at = now() WHERE id = ${input.leadId} RETURNING *
    `;
    lead = mapLeadRow(updatedRows[0]);
  }

  return { touch, lead };
}
