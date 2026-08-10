/**
 * App-wide constants that are genuinely fixed business rules — not roster
 * data. As of §18, PEOPLE/PERSON_TIMEZONES/PERSON_CHANNELS/CHANNELS/
 * AVATAR_COLORS no longer live here: the team roster is fetched live from
 * the `Axisero People` and `Axisero Targets` data sources (see lib/notion.ts
 * `queryAllPeople`/`queryAllTargets`, and lib/aggregate.ts `PersonRecord`/
 * `channelsForPerson`), cached the same way Targets already was. Person and
 * Channel are open string sets now — there's no compile-time closed list to
 * export.
 */

export type Person = string;
export type Channel = string;

/** Local hour before which output still counts as the previous business day (§14a). */
export const DAY_CUTOFF_HOUR = 5;

/** Local hour a Slack nudge fires at, if that person hasn't logged yet (§16g). */
export const NUDGE_HOUR = (() => {
  const raw = Number(process.env.NUDGE_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : 20;
})();

/** Status thresholds & colors — a fixed business rule, not per-person data. */
export const STATUS = {
  ON_TRACK: { label: "On Track", color: "#16A34A", soft: "#F0FDF4" },
  BEHIND: { label: "Behind", color: "#D97706", soft: "#FFFBEB" },
  AT_RISK: { label: "At Risk", color: "#DC2626", soft: "#FEF2F2" },
  NO_TARGET: { label: "No Target", color: "#64748B", soft: "#F1F5F9" },
} as const;

export type StatusKey = keyof typeof STATUS;

/**
 * Deterministic (not random) avatar color per person (§5), now computed from
 * the name itself rather than a hardcoded per-name map — the roster is
 * dynamic, so there's no fixed list of names to map ahead of time. Same name
 * always yields the same color.
 */
const AVATAR_PALETTE = [
  "#4F46E5", // indigo
  "#0891B2", // cyan
  "#DB2777", // pink
  "#059669", // emerald
  "#EA580C", // orange
  "#7C3AED", // violet
  "#0D9488", // teal
  "#CA8A04", // amber-ish gold
  "#E11D48", // rose
  "#2563EB", // blue
] as const;

export function avatarColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
