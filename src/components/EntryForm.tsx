"use client";

import { useEffect, useState } from "react";
import { effectiveDate } from "@/lib/aggregate";
import { DAY_CUTOFF_HOUR, PEOPLE, PERSON_CHANNELS, type Channel, type Person } from "@/lib/constants";
import type { Role } from "@/lib/auth";

type ToastState = { kind: "success" | "error"; message: string } | null;

const CUTOFF_LABEL = `${((DAY_CUTOFF_HOUR + 11) % 12) + 1}${DAY_CUTOFF_HOUR < 12 ? "am" : "pm"}`;

export default function EntryForm({ role }: { role: Role }) {
  const isLocked = role === "member";

  const [person, setPerson] = useState<Person>(PEOPLE[0]);
  const [channel, setChannel] = useState<Channel>(PERSON_CHANNELS[PEOPLE[0]][0]);
  const [date, setDate] = useState(() => effectiveDate(PEOPLE[0]));
  const [outputCount, setOutputCount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const allowedChannels = PERSON_CHANNELS[person];

  function handlePersonChange(next: Person) {
    setPerson(next);
    // Reset synchronously (in the event handler, not an effect) so neither
    // field is ever briefly invalid/stale for the newly-selected person.
    setChannel(PERSON_CHANNELS[next][0]);
    // §14b: re-anchor to the new person's own "today" — for members this is
    // the only value the locked field will ever show; for admin it's just a
    // sensible starting point they're free to change afterward.
    setDate(effectiveDate(next));
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    const countNum = Number(outputCount);
    if (
      outputCount.trim() === "" ||
      !Number.isFinite(countNum) ||
      !Number.isInteger(countNum) ||
      countNum < 0
    ) {
      setFieldError("Output count must be a whole number, 0 or more.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person,
          channel,
          date,
          outputCount: countNum,
          notes: notes.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Failed to save entry.");
      }

      setToast({ kind: "success", message: `Logged ${countNum} for ${channel}.` });
      // Person (and, for admin, whatever Date they set) stays put for fast
      // repeat entry — everything else resets. Members' date is locked to
      // effectiveDate(person) anyway, so re-setting it here is a no-op.
      setChannel(allowedChannels[0]);
      setOutputCount("");
      setNotes("");
      if (isLocked) setDate(effectiveDate(person));
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to save entry.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      {toast && (
        <div
          role="status"
          className={`fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-card border px-4 py-3 text-sm font-medium shadow-sm sm:left-auto sm:right-4 ${
            toast.kind === "success"
              ? "border-good/30 bg-good-soft text-good"
              : "border-risk/30 bg-risk-soft text-risk"
          }`}
        >
          {toast.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-card border border-line bg-card p-5 sm:p-6"
      >
        <div>
          <label htmlFor="person" className="mb-1.5 block text-sm font-medium text-ink">
            Person
          </label>
          <select
            id="person"
            value={person}
            onChange={(e) => handlePersonChange(e.target.value as Person)}
            className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="channel" className="mb-1.5 block text-sm font-medium text-ink">
            Channel
          </label>
          <select
            id="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {allowedChannels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-ink">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              disabled={isLocked}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-80"
            />
            {isLocked && (
              <p className="mt-1.5 text-xs text-ink-muted">
                Set to your current day (rolls over at {CUTOFF_LABEL} local).
              </p>
            )}
          </div>
          <div>
            <label htmlFor="outputCount" className="mb-1.5 block text-sm font-medium text-ink">
              Output count
            </label>
            <input
              id="outputCount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={outputCount}
              onChange={(e) => setOutputCount(e.target.value)}
              placeholder="0"
              className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
        {fieldError && <p className="-mt-3 text-sm text-risk">{fieldError}</p>}

        <div>
          <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-ink">
            Notes <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Blockers, context…"
            className="w-full rounded-lg border border-line bg-page px-3 py-2.5 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-accent text-base font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Log entry"}
        </button>
      </form>
    </div>
  );
}
