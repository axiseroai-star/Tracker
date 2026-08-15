"use client";

import { useState } from "react";
import { PIPELINE_SOURCES, type PipelineSource } from "@/lib/pipeline-constants";
import type { Lead } from "@/lib/pipeline-db";

/**
 * "Add lead" form (Sales Pipeline) — styled to match EntryForm.tsx exactly
 * (h-12/rounded-lg/border-line inputs, same focus ring, same submit button).
 * Contact channel options come from `channels`, the same
 * channelsForPerson()-derived list /log already uses, passed in as a prop
 * from the server component rather than fetched here.
 */
export default function AddLeadForm({
  channels,
  onCreated,
  onCancel,
}: {
  /** This BD's own currently-loggable channels (§18b), server-fetched. */
  channels: string[];
  onCreated: (lead: Lead) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<PipelineSource>(PIPELINE_SOURCES[0]);
  const [proofLink, setProofLink] = useState("");
  const [contactChannel, setContactChannel] = useState(channels[0] ?? "");
  const [contactInfo, setContactInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    if (name.trim().length === 0) {
      setFieldError("Name is required.");
      return;
    }
    if (proofLink.trim().length === 0) {
      setFieldError("Proof link is required.");
      return;
    }
    if (contactInfo.trim().length === 0) {
      setFieldError("Contact info is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pipeline/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          source,
          proofLink: proofLink.trim(),
          contactChannel,
          contactInfo: contactInfo.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Failed to create lead.");
      }
      onCreated(result.lead as Lead);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Failed to create lead.");
    } finally {
      setSubmitting(false);
    }
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-card p-6 text-center text-sm text-ink-muted">
        You have no active responsibilities yet — add one in /admin first.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-card border border-line bg-card p-5 sm:p-6"
    >
      <div>
        <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="lead-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lead's name"
          className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="lead-source" className="mb-1.5 block text-sm font-medium text-ink">
            Source
          </label>
          <select
            id="lead-source"
            value={source}
            onChange={(e) => setSource(e.target.value as PipelineSource)}
            className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {PIPELINE_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lead-channel" className="mb-1.5 block text-sm font-medium text-ink">
            Contact channel
          </label>
          <select
            id="lead-channel"
            value={contactChannel}
            onChange={(e) => setContactChannel(e.target.value)}
            className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="lead-proof" className="mb-1.5 block text-sm font-medium text-ink">
          Proof link
        </label>
        <input
          id="lead-proof"
          type="url"
          value={proofLink}
          onChange={(e) => setProofLink(e.target.value)}
          placeholder="https://…"
          className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div>
        <label htmlFor="lead-contact-info" className="mb-1.5 block text-sm font-medium text-ink">
          Contact info
        </label>
        <input
          id="lead-contact-info"
          type="text"
          value={contactInfo}
          onChange={(e) => setContactInfo(e.target.value)}
          placeholder="Phone, email, handle…"
          className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {fieldError && <p className="-mt-3 text-sm text-risk">{fieldError}</p>}

      <div>
        <label htmlFor="lead-notes" className="mb-1.5 block text-sm font-medium text-ink">
          Notes <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id="lead-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Context…"
          className="w-full rounded-lg border border-line bg-page px-3 py-2.5 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-12 flex-1 items-center justify-center rounded-lg border border-line text-base font-semibold text-ink hover:bg-page"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex h-12 flex-1 items-center justify-center rounded-lg bg-accent text-base font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Add lead"}
        </button>
      </div>
    </form>
  );
}
