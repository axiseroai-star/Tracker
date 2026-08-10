/**
 * Fixed lists for the Axisero Output Tracker.
 *
 * These mirror the Person / Channel select options already seeded into the
 * `Axisero Targets` and `Axisero Daily Log` Notion data sources. They are
 * hardcoded (not fetched from Notion at runtime) per the build spec — the
 * team roster and channel list change rarely enough that this is simpler
 * and avoids an extra Notion round trip on every page load.
 */

export const PEOPLE = [
  "Ahsan Aftab",
  "Abbas Raza",
  "Hafsa Khan",
  "Mohsin Aftab",
  "Najeeb",
  "Halima Sadia",
  "Muqadas Rajput",
] as const;

export type Person = (typeof PEOPLE)[number];

/**
 * Per-person IANA timezone (§14a) — the team isn't in one place, so "today"
 * is resolved per person, not once globally. This replaces the old single
 * NEXT_PUBLIC_TIME_ZONE/APP_TIME_ZONE approach entirely.
 */
export const PERSON_TIMEZONES: Record<Person, string> = {
  "Ahsan Aftab": "Europe/Berlin",
  "Abbas Raza": "Asia/Karachi",
  "Hafsa Khan": "Asia/Karachi",
  "Mohsin Aftab": "Asia/Karachi",
  Najeeb: "Asia/Karachi",
  "Halima Sadia": "Asia/Karachi",
  "Muqadas Rajput": "Asia/Karachi",
};

/** Local hour before which output still counts as the previous business day. */
export const DAY_CUTOFF_HOUR = 5;

export const CHANNELS = [
  "Cold Email",
  "WhatsApp",
  "Cold Calling",
  "Quora",
  "LinkedIn Sales Navigator",
  "Apollo",
  "Meta (FB/IG)",
  "Reddit",
  "Instagram",
  "TikTok",
  "Partnerships",
  "Content Editing",
  "Indeed/Job Portals",
] as const;

export type Channel = (typeof CHANNELS)[number];

/** Which channels each person is allowed to log against (per §3c). */
export const PERSON_CHANNELS: Record<Person, Channel[]> = {
  "Ahsan Aftab": [
    "Cold Email",
    "WhatsApp",
    "Cold Calling",
    "Quora",
    "LinkedIn Sales Navigator",
  ],
  "Abbas Raza": ["LinkedIn Sales Navigator", "Apollo", "Quora"],
  "Mohsin Aftab": ["Cold Email", "Apollo", "LinkedIn Sales Navigator", "Quora"],
  Najeeb: ["Meta (FB/IG)", "WhatsApp", "Reddit", "Quora"],
  "Hafsa Khan": ["Instagram", "TikTok", "Partnerships"],
  "Halima Sadia": ["Content Editing"],
  "Muqadas Rajput": ["Indeed/Job Portals"],
};

/** Deterministic (not random) avatar color per person, used for the initials circle. */
export const AVATAR_COLORS: Record<Person, string> = {
  "Ahsan Aftab": "#4F46E5", // indigo
  "Abbas Raza": "#0891B2", // cyan
  "Hafsa Khan": "#DB2777", // pink
  "Mohsin Aftab": "#059669", // emerald
  Najeeb: "#EA580C", // orange
  "Halima Sadia": "#7C3AED", // violet
  "Muqadas Rajput": "#0D9488", // teal
};

/** Status thresholds & colors, kept alongside the fixed lists for a single source of truth. */
export const STATUS = {
  ON_TRACK: { label: "On Track", color: "#16A34A", soft: "#F0FDF4" },
  BEHIND: { label: "Behind", color: "#D97706", soft: "#FFFBEB" },
  AT_RISK: { label: "At Risk", color: "#DC2626", soft: "#FEF2F2" },
  NO_TARGET: { label: "No Target", color: "#64748B", soft: "#F1F5F9" },
} as const;

export type StatusKey = keyof typeof STATUS;
