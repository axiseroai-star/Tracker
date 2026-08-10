# Axisero Output Tracker

Internal tool for the Axisero team to log daily outreach numbers and see everyone's
output against their targets — one shared web app, backed by Notion.

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Recharts
- Data lives in four Notion data sources (`Axisero Targets`, `Axisero Daily Log`,
  `Axisero Comments`, `Axisero People`)
- **Per-person PIN login (§20).** No shared password — everyone picks their own name at
  `/login` and sets/enters their own 4-6 digit PIN. `role` comes from an `Is Admin` flag
  on their own record, not a second shared password. See "Per-person login" below.
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
- `SESSION_SECRET` and `CRON_SECRET` — generate your own for each (commands are given
  inline in the file); never reuse the values from `.env.example` or commit real ones.
  `SESSION_SECRET` signs every login session (§20) and `CRON_SECRET` gates the three
  `/api/cron/*` routes (§16e/§16g) — treat both as real credentials.

Data source IDs and database URLs are already filled in. `.env.local` is gitignored — it
will never be committed.

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
   `CRON_SECRET` must be set for `/api/cron/*` to work at all — see below.
3. Confirm the Notion integration is still connected to all four databases (step 1.3) —
   this is the most common "works locally, not in prod" gap.

### 5. Optional: scheduled jobs (§16e, §16g)

`vercel.json` defines three Vercel Cron jobs — a weekly CSV backup email, an hourly
Slack nudge check, and a weekly Slack digest. All three are already wired up and will
deploy automatically; each one just no-ops (200, not an error) until its own env vars are
filled in, **except** `CRON_SECRET`, which every one of them requires unconditionally
(they fail closed — 500 — without it, since it's their only auth, in place of the session
cookie every other route uses).

- **Backup** (`/api/cron/backup`, Monday 06:00 UTC): sign up at [resend.com](https://resend.com)
  (free tier), set `RESEND_API_KEY` and `BACKUP_EMAIL_TO`.
- **Nudge** (`/api/cron/nudge`, hourly) and **digest** (`/api/cron/digest`, Monday 07:00
  UTC): create a Slack App → enable **Incoming Webhooks** → generate a webhook URL for
  the target channel → set `SLACK_WEBHOOK_URL`.

> **Vercel plan note:** the nudge job is scheduled hourly because that's what makes one
> schedule work correctly across everyone's different timezones (§16g) — but **Vercel's
> Hobby (free) plan only runs cron jobs once a day**, regardless of the schedule you set;
> hourly cadence needs a Pro plan. On Hobby, the nudge job will still run and no-op
> gracefully the rest of the time, but nudges will only actually fire roughly once a day
> rather than at everyone's precise `NUDGE_HOUR`. If that's not good enough, either
> upgrade to Pro or point an external scheduler (e.g. a free cron-ping service) at
> `/api/cron/nudge` with the `Authorization: Bearer $CRON_SECRET` header instead of
> relying on `vercel.json`.

## Project structure

```
src/
  app/
    login/page.tsx          Per-person PIN login — pick a name, create/enter your PIN (§20)
    meeting/page.tsx            Chrome-free, large-text dashboard subset for screen-share (§16i)
    (app)/                    Route group sharing the sidebar shell (§22) — folder name is
                                 excluded from the URL, so these pages are still /, /log, etc.
      layout.tsx                 Resolves the session, wraps children in <AppShell>
      page.tsx                    Dashboard (default landing page) — Server Component
      log/page.tsx                 Daily entry form — Person is your own session identity, not a pick
      targets/page.tsx             Read-only targets view (members)
      trends/page.tsx                Per-person output over 30/90 days (§16a)
      admin/page.tsx                 Admin console — Server Component, redirects non-admins (§13a)
    api/
      auth/people/               GET the Active roster + whether each has a PIN yet — pre-auth (§20b)
      auth/login|logout/         Create/verify a PIN and issue the session, or clear it (§20b)
      dashboard/                Aggregated dashboard JSON (via lib/dashboard-data.ts)
      targets/                  Targets grouped by the live Active roster
      trends/                    Per-person daily output over N days (§16a)
      log/                      Create a Daily Log entry — self always allowed; another person
                                   only if the session is admin (§20c)
      admin/entries/             GET full history (incl. archived) — admin only
      admin/entries/[id]/         PATCH archived/flagged — admin only
      admin/comments/             GET all (incl. hidden) comments for a row — admin only
      admin/targets/               POST a new responsibility — admin only
      admin/targets/[id]/         PATCH Daily Target and/or Archived — admin only
      admin/target-suggestions/    GET 14-day recent averages per person/channel (§16c)
      admin/people/                GET all people / POST add a team member — admin only
      admin/people/[id]/           PATCH Active/Timezone/resetPin — admin only (§18d, §20d)
      comments/                    GET visible thread / POST a reply — any session, Author = session identity (§16d, §20c)
      comments/[id]/               PATCH/DELETE — admin, or the reply's own Author (verified via session, §20c)
      cron/backup/                 Weekly CSV email via Resend — CRON_SECRET-protected (§16e)
      cron/nudge/                   Hourly per-person Slack nudge check (§16g)
      cron/digest/                  Weekly Slack KPI digest (§16g)
  lib/
    notion.ts                 Notion client + query/create/update helpers (server-only)
    aggregate.ts               Pure rolling-window / attainment / status / trend / roster logic
    aggregate.test.ts          Unit tests for the above (`npm test`)
    dashboard-data.ts           Shared fetch+aggregate used by /api/dashboard and the digest cron
    format.ts                  Display-only date formatting + CSV export
    slack.ts                    Incoming-webhook post + @mention formatting (server-only)
    constants.ts                DAY_CUTOFF_HOUR, NUDGE_HOUR, STATUS, avatarColorForName
                                 (no more PEOPLE/CHANNELS/PERSON_CHANNELS — see §18 below)
    pin.ts                      bcrypt hash/verify + PIN format check (server-only, §20a)
    auth.ts                     Signed session cookie helpers ({person, role}), admin + cron
                                 guards (server-only) — no more password resolution (§20)
    rate-limit.ts                In-memory limiter for /api/auth/login
  components/                  AppShell (sidebar + mobile tab bar, §22), KpiCard, PersonCard,
                                 WeeklyBarChart, ChannelMatrix, AdminEntriesTable,
                                 AdminTargetsPanel, AdminTeamPanel, CommentPanel,
                                 PersonCommentsModal, AdminClient, ServiceWorkerRegister
  proxy.ts                     Redirects to /login when the session cookie is missing (except
                                 /api/cron/*, which use their own CRON_SECRET check instead),
                                 and bounces non-admins away from /admin* (optimistic — §13a)
                                 (renamed from `middleware.ts` in Next.js 16)
public/
  manifest.json               PWA manifest (§16h)
  sw.js                        Minimal pass-through service worker — no offline caching for v1
  icons/                       192/512/maskable-512/apple-touch PNGs
```

## UI: sidebar navigation (§22)

Navigation lives in a persistent left sidebar (`AppShell.tsx`), not a per-page top bar.
Every page under the `(app)` route group — Dashboard, Log, Targets, Trends, Admin —
shares it via `app/(app)/layout.tsx`, which resolves the session once and renders
`<AppShell>` around whatever page is active; each page itself now renders only its own
heading and content, no nav chrome.

- **Desktop (≥768px):** fixed sidebar — "Axisero / Output Tracker" branding, a full-width
  accent **"+ Log output"** button, then the nav list (Dashboard, Targets, Trends, Meeting
  view, and Admin when `role === "admin"`) with an accent-tinted highlight on the active
  route. The logged-in person's name and a **Log out** button are pinned at the bottom.
- **Mobile (<768px):** the sidebar becomes a fixed bottom tab bar — Dashboard, Log, and a
  **More** tab (not a hamburger drawer) that pops up the rest — Targets, Trends, Meeting
  view, Admin, and Log out — so "Log output" is always one tap away.
- The Admin *link* is only ever hidden/shown by role — it was never the access control.
  `app/(app)/admin/page.tsx`'s server-side `redirect("/")` for non-admins (§13a) is
  unchanged and is what actually enforces it.
- `/login` (pre-auth) and `/meeting` (deliberately chrome-free, §16i) live outside the
  `(app)` route group and never render this shell.
- A per-person streak counter (§16b) was designed but cancelled before shipping — see
  "Trends" below for what actually exists.

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

**No backdating when acting as yourself; admin keeps full override when acting as someone
else (§14b, §20c):** `/log`'s `EntryForm` always renders in `mode="self"` — Person is a
fixed label read from the session identity, Date is set to `effectiveDate(person)` and
locked (disabled). This applies to *everyone*, admins included — an admin visiting `/log`
still only logs as themselves. `/api/log` independently derives whether a submission is
"acting as self" by comparing the submitted person to the session's own identity (never a
client-supplied flag): if they match, it recomputes `effectiveDate` server-side and
rejects (400) anything that doesn't match, regardless of role. If they don't match, the
request is only allowed when the session's role is admin (403 otherwise) — that's
`/admin`'s dedicated "log for anyone" form (`mode="any"`, a full Person dropdown, Date
fully editable), the one deliberate exception, and the only path missed-day backfills go
through.

The dashboard route makes four Notion queries per load — Daily Log (one date range
buffered wide enough to cover every person's current-week *and* previous-week window
regardless of timezone, roughly `today-15` to `today+1` in UTC, `Archived` rows
excluded), Targets (cached in-memory for 5 minutes), visible Comments (§13d/§16d, for
the comment thread), and People (cached the same way, §18) — then aggregates each
person's actual window and comment thread in memory. It never loops a query per person,
per channel, or per row, even though the effective windows differ per person.

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

## Per-person login (§20)

There's no shared password anymore. `/login` fetches the Active roster from `Axisero
People` (`/api/auth/people`, pre-auth — names and whether each already has a PIN, nothing
sensitive) and shows it as a list of names to pick from:

- **First login** — no `PIN Hash` on that person's row yet: "Create your PIN" prompts for
  a 4-6 digit PIN plus a confirmation. The server (never the client) decides this is a
  create, not a verify, purely from whether a hash already exists — bcrypt-hashes it
  (`lib/pin.ts`, 10 salt rounds) and saves it to their `Axisero People` row, then logs
  them in. This is how everyone bootstraps their own credential; no admin has to
  pre-generate or distribute anything.
- **Returning login** — `PIN Hash` already set: "Enter your PIN," bcrypt-compared against
  the stored hash server-side.
- The session cookie now carries `{ person, role, iat }` — `role` is read from that
  person's `Is Admin` checkbox at login time, the same server-side-enforced pattern as
  before (§13a), just sourced from a per-person flag instead of which of two shared
  passwords was typed. **Ahsan Aftab is pre-set to `Is Admin: true`**, so there's a
  working admin from the very first login.
- **Forgot your PIN?** No email/SMS reset in v1 (that needs a delivery mechanism this app
  doesn't have yet). Instead, `/admin`'s Team section has a **Reset PIN** button per
  person (§20d) — it clears their `PIN Hash`, and their next login goes through "Create
  your PIN" again, same as a first login.
- PIN brute-forcing is a real consideration (4-6 digits is much lower entropy than a
  chosen password) — the same IP rate limit as before (5 attempts/minute) still applies
  to `/api/auth/login`, and bcrypt's inherent per-attempt cost is the other half of the
  mitigation.

## Admin role

`role: "admin"` now comes from a person's own `Is Admin` flag rather than a second shared
password (see "Per-person login" above). Admins get an **Admin** link in the nav leading
to `/admin`, which:

- **Team** and **Responsibilities** sections — see "Dynamic team & responsibilities" above.
- Shows every Daily Log row ever created (not just the rolling 7-day window), with
  person/channel/date filters, sortable columns, and a "show archived" toggle.
- Reuses the exact `/log` entry form — the Person field was already unrestricted for
  everyone (see the note below), so nothing changes there for admin specifically.
- Archives/restores rows (flips the `Archived` checkbox) and flags rows (`Flagged`
  checkbox) — never a hard delete.
- Opens a comment thread per row, backed by the `Axisero Comments` data source, with
  edit/delete on any comment (§16d). New top-level comments default to
  `Visible To Person = true`.
- Edits `Daily Target` inline (PATCHes the Targets data source directly), with a
  "Recent avg" 14-day figure and a one-click "Use suggestion" fill next to each field
  that never auto-saves on its own (§16c) — `/targets` stays read-only for members.
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

**Formerly a trust note, now resolved by §20:** earlier versions of this app (§13e, §16d)
had no real per-person login, so nothing stopped someone from picking a different name on
`/log` or a comment reply — that was a documented, accepted tradeoff of the shared-password
model at the time, not an oversight. Per-person PIN login (§20) closes that gap: `/log`'s
Person field is read from a verified session identity, not a free pick, and `/api/log`
enforces server-side that acting as someone else requires `role === "admin"` — the one
remaining, deliberate exception (admin's "log for anyone" form), not a general gap anymore.

## Trends (§16a)

`/trends` shows each active person's daily output over the last 30 or 90 days — a
separate, paginated Daily Log query (`queryDailyLogByDateRange` already pages via
`start_cursor` internally), independent of the dashboard's rolling 7-day window and not
sharing its query budget.

> A per-person streak counter (§16b) was built and then cancelled before shipping — it's
> not part of the app.

## Two-way comments (§16d, §20c)

Comments have an `Author` field (a person's name — historical rows created by the old
shared-password admin flow may still show the literal string `"Admin"`). Anyone — member
or admin — can reply to a comment thread on any person's card; `Author` is read directly
from the session identity now (§20c), not a "Replying as" dropdown — there's nothing to
pick, since login already established who's typing. Edit/delete works for admin (any
comment) or for whoever's session identity matches that comment's `Author` — enforced
server-side in `/api/comments/[id]` against the verified session, not a client-submitted
claim.

## Installable app & meeting view (§16h, §16i)

The app can be installed to a phone or desktop home screen (`public/manifest.json` +
a minimal pass-through service worker registered from the root layout — no offline
data sync for v1, installability was the only goal). `/meeting` is a separate,
chrome-free route — large text, high contrast, no nav/buttons/filters/admin controls,
just the KPI strip, the weekly bar chart, and a plain per-person status list — meant to
stay legible when a laptop screen showing it is shared and shrunk into a Google Meet
window. It auto-refreshes every 90 seconds with no visible controls.

## Testing

```bash
npm test    # unit tests for lib/aggregate.ts — workingDays, attainment, status,
            # trends/channel-averages, and buildDashboard, all against an injected roster
npm run lint
npm run build
```

## Out of scope for v1

Per-user *Notion* accounts / OAuth login — §20's PIN login gives everyone a verified
identity without needing that; full Notion seats remain unnecessary. Self-service PIN
reset via email/SMS (no delivery mechanism yet — an admin resets it for you instead, see
"Per-person login" above). A ranked leaderboard was deliberately left out — easy to
build, but risks souring team dynamics for whoever's currently at risk; revisit only if
explicitly asked again. WhatsApp nudges were scoped down to Slack-only for this round —
the WhatsApp Business API needs phone verification and template approval, a meaningfully
bigger project than a Slack webhook. Everything else that used to be listed here
(editing/archiving Daily Log entries, editing Targets, historical trend views,
notifications, "you can only log as yourself") now exists in some admin-gated or
identity-verified form — see the sections above.
