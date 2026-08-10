# Axisero Output Tracker

Internal tool for the Axisero team to log daily outreach numbers and see everyone's
output against their targets — one shared web app, backed by Notion.

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Recharts
- Data lives in four Notion data sources (`Axisero Targets`, `Axisero Daily Log`,
  `Axisero Comments`, `Axisero People`)
- Two shared passwords — `APP_PASSWORD` (member) and `ADMIN_PASSWORD` (admin) — no per-user accounts
- All Notion access happens server-side; the integration token never reaches the browser
- **The team roster is live Notion data, not code (§18).** There's no hardcoded person or
  channel list anywhere — admin manages who's on the team and what they're responsible
  for from `/admin`, no redeploy needed. See "Dynamic team & responsibilities" below.

## One-time setup

### 1. Create the Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new **internal integration**. This is separate from any Claude↔Notion connection — the app needs its own token.
2. Copy the **Internal Integration Secret**.
3. Open all four databases in Notion — `Axisero Targets`, `Axisero Daily Log`, `Axisero Comments`, and `Axisero People` — and use **"Connect to" / "Add connection"** on each to share it with the new integration. Only share these four; don't grant workspace-wide access. Without this step the API token can't read or write any of them.

### 2. Configure environment variables

```bash
cp .env.example .env.local   # already done for you in this checkout
```

Open `.env.local` and fill in the `FILL-IN` values:

- `NOTION_TOKEN` — the Internal Integration Secret from step 1.
- `APP_PASSWORD` — whatever password the team should use to log in (grants `role: "member"`).
- `ADMIN_PASSWORD` — a separate password for privileged access (grants `role: "admin"`, unlocks `/admin`). Keep it different from `APP_PASSWORD` and don't share it with the team.

Everything else (data source IDs, database URLs, a pre-generated `SESSION_SECRET`) is
already filled in. `.env.local` is gitignored — it will never be committed.

### 3. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on `/login`.

### 4. Deploy to Vercel

1. Push this repo, import it into Vercel.
2. Under **Project Settings → Environment Variables**, add the same variables from
   `.env.local` (do **not** upload the file itself — Vercel encrypts these at rest).
3. Confirm the Notion integration is still connected to all four databases (step 1.3) —
   this is the most common "works locally, not in prod" gap.

## Project structure

```
src/
  app/
    login/page.tsx          Password gate (member or admin, same form)
    page.tsx                 Dashboard (default landing page) — Server Component, resolves role
    log/page.tsx              Daily entry form
    targets/page.tsx          Read-only targets view (members)
    admin/page.tsx             Admin console — Server Component, redirects non-admins (§13a)
    api/
      auth/login|logout/       Session cookie issue/clear (role-aware)
      dashboard/                Aggregated dashboard JSON (excludes archived, includes comment counts)
      targets/                  Targets grouped by person
      log/                      Create a Daily Log entry (any person — see §13e note below)
      admin/entries/             GET full history (incl. archived) — admin only
      admin/entries/[id]/         PATCH archived/flagged — admin only
      admin/comments/             GET/POST top-level comments for a row — admin only
      admin/targets/               POST a new responsibility — admin only
      admin/targets/[id]/         PATCH Daily Target and/or Archived — admin only
      admin/people/                GET all people / POST add a team member — admin only
      admin/people/[id]/           PATCH Active/Timezone — admin only
      comments/                    GET visible thread / POST a reply — any session (§16d)
      comments/[id]/               PATCH/DELETE — admin, or the reply's own Author
  lib/
    notion.ts                 Notion client + query/create/update helpers (server-only)
    aggregate.ts               Pure rolling-window / attainment / status / streak / roster logic
    aggregate.test.ts          Unit tests for the above (`npm test`)
    format.ts                  Display-only date formatting + CSV export
    constants.ts                DAY_CUTOFF_HOUR, NUDGE_HOUR, STATUS, avatarColorForName
                                 (no more PEOPLE/CHANNELS/PERSON_CHANNELS — see §18 below)
    auth.ts                     Signed session cookie helpers, roles, admin guard (server-only)
    rate-limit.ts                In-memory limiter for /api/auth/login
  components/                  KpiCard, PersonCard, WeeklyBarChart, ChannelMatrix, …
                                 AdminEntriesTable, AdminTargetsPanel, AdminTeamPanel,
                                 CommentPanel, PersonCommentsModal, AdminClient
  proxy.ts                     Redirects to /login when the session cookie is missing, and
                                 bounces non-admins away from /admin* (optimistic — see §13a)
                                 (renamed from `middleware.ts` in Next.js 16)
```

## How the numbers are computed

Rolling window: always `[effectiveDate(person) - 6, effectiveDate(person)]`, recomputed
on every dashboard load — there's no stored "week" concept. **"Today" is per-person, not
one shared value (§14).** The team isn't in one timezone: each person's `Timezone` field
lives on their `Axisero People` row (§18a, editable from `/admin`'s Team section — no
redeploy needed), and `effectiveDate(timeZone, now)` in `lib/aggregate.ts` converts `now`
into that zone's local time — if the local hour is before `DAY_CUTOFF_HOUR` (5am), it's
still counted as the previous business day. This is the single source of truth for "what
day is it" for that person, used identically by the `/log` date lock, `/api/log`'s
server-side check, the missed-today banner, and every per-person window/sparkline/KPI.
Two people can legitimately have a different `effectiveToday` — and therefore a slightly
different 7-day window — at the exact same moment, which is also why the dashboard
header just says "Rolling 7-day window" instead of a specific date range.

```
weeklyTarget   = dailyTarget × working days (Mon–Fri) in the window
attainment     = target === 0 ? null : actual / target
status         = null → No Target · ≥100% → On Track · 70–99% → Behind · <70% → At Risk
```

**No backdating for members, admin keeps full override (§14b):** on `/log`, once
Person is selected the Date field is set to `effectiveDate(person)` and locked
(disabled) for `role === "member"` — they can't type in an arbitrary date at all.
`/api/log` independently recomputes `effectiveDate(person)` server-side and rejects
(400) any member submission whose date doesn't match — the client-side lock is a UX
nicety, never the actual enforcement. Admin's "log for anyone" form (in `/admin`, same
`EntryForm` component, same `/api/log` endpoint) keeps the Date field fully editable,
and the server-side check is skipped entirely when `role === "admin"` — that's the only
path missed-day backfills go through.

The dashboard route makes four Notion queries per load — Daily Log (one date range
buffered wide enough to cover every person's own window regardless of timezone, plus
streak lookback (§16b), roughly `today-35` to `today+1` in UTC, `Archived` rows
excluded), Targets (cached in-memory for 5 minutes), visible Comments (§13d/§16d, for
the comment thread), and People (cached the same way, §18) — then aggregates each
person's actual window, streak, and comment thread in memory. It never loops a query per
person, per channel, or per row, even though the effective windows differ per person.

## Dynamic team & responsibilities (§18)

`PEOPLE`, `PERSON_TIMEZONES`, and `PERSON_CHANNELS` no longer exist as hardcoded
constants — the roster and who's responsible for which channel are both live Notion
data, cached the same way Targets already was (5-minute in-memory TTL, busted on any
write). Admin manages all of it from `/admin`, no code change or redeploy required:

- **Team section** — every `Axisero People` row, with an Active toggle and an editable
  Timezone (saves on blur). "Add team member" creates a new row (`Active: true`) and
  immediately adds their name as a valid `Person`/`Author` select option on Targets,
  Daily Log, and Comments via an explicit schema-update call (`ensurePersonOptionEverywhere`
  in `lib/notion.ts`) — it doesn't wait on/trust Notion's implicit auto-create-on-write.
  Deactivating someone (never delete) removes them from `/log`, the dashboard person-card
  grid, and the missed-today check; their history stays fully intact and stays visible in
  `/admin`.
- **Responsibilities section** (extends the §13c target editor) — "Add a responsibility"
  creates a new Targets row: Person is a dropdown of Active people, Channel is a
  free-text combobox (autocompletes from channels already in use, or type a new one to
  introduce it — no schema migration needed). Each row also gets an Archive/Restore
  control (flips `Archived` on Targets, mirroring the Daily Log pattern from §13b/§14) —
  archived responsibilities drop out of `/log`'s channel list but the row and its
  historical Daily Log entries stay intact.
- A person's channel options on `/log` = the distinct, non-archived Targets rows for
  that person (`channelsForPerson` in `lib/aggregate.ts`) — computed from the same
  Targets fetch the dashboard already does, no extra Notion call.
- New team members have no Targets rows yet, so they can't log anything until admin adds
  at least one responsibility for them — the entry form says so plainly rather than
  showing an empty channel dropdown.

## Admin role

Logging in with `ADMIN_PASSWORD` instead of `APP_PASSWORD` grants `role: "admin"` on the
session cookie (same login form, same cookie mechanism — just a second password checked
in `/api/auth/login`). Admins get an **Admin** link in the nav leading to `/admin`, which:

- Shows every Daily Log row ever created (not just the rolling 7-day window), with
  person/channel/date filters, sortable columns, and a "show archived" toggle.
- Reuses the exact `/log` entry form — the Person field was already unrestricted for
  everyone (see the note below), so nothing changes there for admin specifically.
- Archives/restores rows (flips the `Archived` checkbox) and flags rows (`Flagged`
  checkbox) — never a hard delete.
- Opens a comment thread per row, backed by the `Axisero Comments` data source. New
  comments default to `Visible To Person = true`.
- Edits `Daily Target` inline (PATCHes the Targets data source directly) — `/targets`
  stays read-only for members by design.
- Exports the currently-filtered table to CSV, client-side, no extra request.

**Access control is enforced three times, independently:** `proxy.ts` redirects a
non-admin away from `/admin*` (optimistic, for UX); `app/admin/page.tsx` re-checks the
session server-side and `redirect()`s if it isn't an admin; and every `/api/admin/*`
route calls `requireAdminResponse()` and returns `403` before touching Notion. Hiding
the nav link alone would not be access control, so it isn't relied on for anything.

**Comment badge for members:** if any of a person's Daily Log entries (within the
dashboard's fetched window) have a visible comment, their person card on `/` shows a
small 💬 count badge — comments aren't invisible to the person they're about, even
though there's no per-user login to scope a personal view to.

**Trust note (§13e):** nothing in the schema stops a regular member from picking
someone else's name on `/log` — that was true before the admin role existed and remains
true after. The admin role adds extra powers on top of the shared entry form; it
doesn't add new restrictions on top of what members could already do. Real per-person
restrictions would require actual per-person accounts, which is out of scope (see below).

## Testing

```bash
npm test    # unit tests for lib/aggregate.ts (workingDays, attainment, status, buildDashboard)
npm run lint
npm run build
```

## Out of scope for v1

Per-user Notion accounts (so `/log` still can't restrict "you can only log as
yourself" — see the trust note above), historical charts beyond the rolling 7-day
window, and notifications/reminders. Editing/deleting/archiving Daily Log entries and
editing Targets are now possible, but **admin-only** via `/admin` (§13) — members still
get read-only `/targets` and no delete/archive controls at all.
