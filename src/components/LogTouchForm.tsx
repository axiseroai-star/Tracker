"use client";

import { useState } from "react";
import { PIPELINE_OUTCOMES, type PipelineOutcome } from "@/lib/pipeline-constants";
import type { Lead, Touch } from "@/lib/pipeline-db";

/**
 * Small inline form for logging a touch on a lead card. `hasTouchToday`
 * comes from the leads GET response (computed server-side via
 * effectiveDate()) — the disabled state is a UX nicety mirroring what the
 * server already enforces via UNIQUE(lead_id, date), not the source of truth.
 */
export default function LogTouchForm({
  leadId,
  hasTouchToday,
  onLogged,
}: {
  leadId: number;
  hasTouchToday: boolean;
  onLogged: (result: { touch: Touch; lead: Lead }) => void;
}) {
  const [outcome, setOutcome] = useState<PipelineOutcome>(PIPELINE_OUTCOMES[0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/pipeline/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, outcome, notes: notes.trim() || undefined }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Failed to log touch.");
      }
      setNotes("");
      onLogged({ touch: result.touch, lead: result.lead });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log touch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-line pt-3">
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as PipelineOutcome)}
        disabled={hasTouchToday}
        className="h-10 w-full rounded-lg border border-line bg-page px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {PIPELINE_OUTCOMES.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={hasTouchToday}
        placeholder="Notes (optional)"
        className="w-full rounded-lg border border-line bg-page px-2.5 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error && <p className="text-xs text-risk">{error}</p>}
      <button
        type="submit"
        disabled={hasTouchToday || submitting}
        className="flex h-9 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {hasTouchToday ? "Already logged today" : submitting ? "Saving…" : "Log touch"}
      </button>
    </form>
  );
}
