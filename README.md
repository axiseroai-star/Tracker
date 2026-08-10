# Axisero Output Tracker

Internal tool for the 7-person Axisero team to log daily outreach numbers and see
everyone's output against their targets — one shared web app, backed by Notion.

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Recharts
- Data lives in three Notion data sources (`Axisero Targets`, `Axisero Daily Log`, `Axisero Comments`)
- Two shared passwords — `APP_PASSWORD` (member) and `ADMIN_PASSWORD` (admin) — no per-user accounts
- All Notion access happens server-side; the integration token never reaches the browser

## One-time setup

### 1. Create the Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new **internal integration**. This is separate from any Claude↔Notion connection — the app needs its own token.
2. Copy the **Internal Integration Secret**.
3. Open all three databases in Notion — `Axisero Targets`, `Axisero Daily Log`, and `Axisero Comments` — and use **"Connect to" / "Add connection"** on each to share it with the new integration. Only share these three; don't grant workspace-wide access. Without this step the API token can't read or write any of them.

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
3. Confirm the Notion integration is still connected to all three databases (step 1.3) —
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
      admin/comments/             GET/POST comments for a row — admin only
      admin/targets/[id]/         PATCH Daily Target — admin only
  lib/
    notion.ts                 Notion client + query/create/update helpers (server-only)
    aggregate.ts               Pure rolling-window / attainment / status / comment-count logic
    aggregate.test.ts          Unit tests for the above (`npm test`)
    format.ts                  Display-only date formatting + CSV export
    constants.ts                PEOPLE, CHANNELS, PERSON_CHANNELS, AVATAR_COLORS
    auth.ts                     Signed session cookie helpers, roles, admin guard (server-only)
    rate-limit.ts                In-memory limiter for /api/auth/login
  components/                  KpiCard, PersonCard, WeeklyBarChart, ChannelMatrix, …
                                 AdminEntriesTable, AdminTargetsPanel, CommentPanel, AdminClient
  proxy.ts                     Redirects to /login when the session cookie is missing, and
                                 bounces non-admins away from /admin* (optimistic — see §13a)
                                 (renamed from `middleware.ts` in Next.js 16)
```

## How the numbers are computed

Rolling window: always `[effectiveDate(person) - 6, effectiveDate(person)]`, recomputed
on every dashboard load — there's no stored "week" concept. **"Today" is per-person, not
one shared value (§14).** The team isn't in one timezone: `PERSON_TIMEZONES` in
`lib/constants.ts` maps each person to an IANA zone, and `effectiveDate(person, now)` in
`lib/aggregate.ts` converts `now` into their local time — if the local hour is before
`DAY_CUTOFF_HOUR` (5am), it's still counted as the previous business day. This is the
single source of truth for "what day is it" for that person, used identically by the
`/log` date lock, `/api/log`'s server-side check, the missed-today banner, and every
per-person window/sparkline/KPI. Two people can legitimately have a different
`effectiveToday` — and therefore a slightly different 7-day window — at the exact same
moment, which is also why the dashboard header just says "Rolling 7-day window" instead
of a specific date range.

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

The dashboard route makes three Notion queries per load — Daily Log (one date range
buffered wide enough to cover every person's own window regardless of timezone, roughly
`today-8` to `today+1` in UTC, `Archived` rows excluded), Targets (cached in-memory for
5 minutes), and visible Comments (§13d, for the comment-count badge) — then aggregates
each person's actual window in memory. It never loops a query per person, per channel,
or per row, even though the effective windows differ per person.

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
