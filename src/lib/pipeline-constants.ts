/**
 * Sales Pipeline (leads/touches) — fixed business-rule string sets, the same
 * role constants.ts plays for the Notion-backed Daily Log. Both API routes
 * and UI import these rather than repeating string literals.
 */

export const PIPELINE_SOURCES = [
  "Meta Ad",
  "Google Maps",
  "LinkedIn",
  "Meta Ad Library",
] as const;
export type PipelineSource = (typeof PIPELINE_SOURCES)[number];

export const PIPELINE_STATUSES = [
  "New",
  "Contacted",
  "Replied",
  "Interested",
  "Not Interested",
  "Handed Off",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const PIPELINE_OUTCOMES = [
  "No Reply",
  "Replied",
  "Went to Spam",
  "Interested",
  "Not Interested",
] as const;
export type PipelineOutcome = (typeof PIPELINE_OUTCOMES)[number];

/** Terminal statuses — a BD can no longer log touches once a lead reaches one of these. */
export const TERMINAL_STATUSES: readonly PipelineStatus[] = ["Not Interested", "Handed Off"];

export function isPipelineSource(value: unknown): value is PipelineSource {
  return typeof value === "string" && (PIPELINE_SOURCES as readonly string[]).includes(value);
}

export function isPipelineOutcome(value: unknown): value is PipelineOutcome {
  return typeof value === "string" && (PIPELINE_OUTCOMES as readonly string[]).includes(value);
}
