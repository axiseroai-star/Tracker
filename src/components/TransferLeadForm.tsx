"use client";

import { useState } from "react";
import type { Lead, Transfer } from "@/lib/pipeline-db";

/**
 * Transfer is intentionally open (confirmed with the CEO): unlike
 * LogTouchForm (owner-only) and the delete button (owner-or-admin), this is
 * rendered for every viewer regardless of ownership — the ownership check
 * that matters is server-side (or rather, its deliberate absence — see the
 * transfer API route). `activePeople` already excludes the lead's current
 * owner (see PipelineBoard's LeadDetail).
 */
export default function TransferLeadForm({
  leadId,
  candidates,
  onTransferred,
}: {
  leadId: number;
  candidates: string[];
  onTransferred: (result: { lead: Lead; transfer: Transfer }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [toOwner, setToOwner] = useState(candidates[0] ?? "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null; // no other active person to transfer to

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toOwner) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pipeline/leads/${leadId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toOwner, note: note.trim() || undefined }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Failed to transfer lead.");
      }
      onTransferred({ lead: result.lead, transfer: result.transfer });
      setOpen(false);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer lead.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-muted hover:border-accent hover:text-accent"
      >
        ⇄ Transfer
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 w-full space-y-2 border-t border-line pt-3">
      <select
        value={toOwner}
        onChange={(e) => setToOwner(e.target.value)}
        disabled={submitting}
        className="h-10 w-full rounded-lg border border-line bg-page px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {candidates.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={submitting}
        placeholder="Note (optional) — why is this moving?"
        className="w-full rounded-lg border border-line bg-page px-2.5 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error && <p className="text-xs text-risk">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex h-9 flex-1 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {submitting ? "Transferring…" : `Transfer to ${toOwner}`}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="flex h-9 items-center justify-center rounded-lg border border-line px-3 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
