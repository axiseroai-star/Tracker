"use client";

import { useEffect, useState } from "react";
import { effectiveDate } from "@/lib/aggregate";
import { DAY_CUTOFF_HOUR } from "@/lib/constants";

export interface EntryFormPerson {
  name: string;
  timezone: string;
}

type ToastState = { kind: "success" | "error"; message: string } | null;

const CUTOFF_LABEL = `${((DAY_CUTOFF_HOUR + 11) % 12) + 1}${DAY_CUTOFF_HOUR < 12 ? "am" : "pm"}`;

export default function EntryForm({
  mode,
  sessionPerson,
  people,
  personChannels,
}: {
  /**
   * "self" — /log, for everyone including admins: Person is fixed to the
   * logged-in identity, Date is locked (§14b, §20c). "any" — admin's
   * dedicated "log for anyone" section in /admin: full Person dropdown,
   * Date fully editable. This is driven by *which form this is*, not by
   * role — an admin visiting /log still only logs as themselves; the "any"
   * privilege only exists inside the /admin-only embedded instance.
   */
  mode: "self" | "any";
  /** Required when mode === "self" — the verified session identity (§20c). */
  sessionPerson?: string;
  /** The live Active roster (§18) — fetched server-side by the page that renders this form. */
  people: EntryFormPerson[];
  /** person name -> their currently-loggable (non-archived) channels (§18b). */
  personChannels: Record<string, string[]>;
}) {
  const isLocked = mode === "self";
  const initialPerson = isLocked ? (sessionPerson ?? "") : (people[0]?.name ?? "");
  const initialTimezone = people.find((p) => p.name === initialPerson)?.timezone;

  const [person, setPerson] = useState(initialPerson);
  const [channel, setChannel] = useState(personChannels[initialPerson]?.[0] ?? "");
  const [date, setDate] = useState(() =>
    initialTimezone ? effectiveDate(initialTimezone) : ""
  );
  const [outputCount, setOutputCount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const allowedChannels = personChannels[person] ?? [];

  function handlePersonChange(nextName: string) {
    setPerson(nextName);
    const nextChannels = personChannels[nextName] ?? [];
    // Reset synchronously (in the event handler, not an effect) so neither
    // field is ever briefly invalid/stale for the newly-selected person.
    setChannel(nextChannels[0] ?? "");
    const nextPerson = people.find((p) => p.name === nextName);
    // §14b: re-anchor to the new person's own "today" — for "self" mode
    // this is the only value the locked field will ever show; for "any" it's
    // just a sensible starting point admin is free to change afterward.
    if (nextPerson) setDate(effectiveDate(nextPerson.timezone));
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
      // Person (and, in "any" mode, whatever Date was set) stays put for
      // fast repeat entry — everything else resets. "self" mode's date is
      // locked to effectiveDate(person) anyway, so re-setting it is a no-op.
      setChannel(allowedChannels[0] ?? "");
      setOutputCount("");
      setNotes("");
      const current = people.find((p) => p.name === person);
      if (isLocked && current) setDate(effectiveDate(current.timezone));
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to save entry.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "any" && people.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-card p-6 text-center text-sm text-ink-muted">
        No active team members yet — add one in /admin&apos;s Team section first.
      </div>
    );
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
          <label className="mb-1.5 block text-sm font-medium text-ink">Person</label>
          {mode === "self" ? (
            <p className="flex h-12 w-full items-center rounded-lg border border-line bg-page px-3 text-base font-medium text-ink">
              {person || "—"}
            </p>
          ) : (
            <select
              id="person"
              value={person}
              onChange={(e) => handlePersonChange(e.target.value)}
              className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {people.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="channel" className="mb-1.5 block text-sm font-medium text-ink">
            Channel
          </label>
          {allowedChannels.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line bg-page px-3 py-3 text-sm text-ink-muted">
              {person || "This person"} has no active responsibilities yet — add one in /admin
              first.
            </p>
          ) : (
            <select
              id="channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="h-12 w-full rounded-lg border border-line bg-page px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {allowedChannels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
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
          disabled={submitting || allowedChannels.length === 0 || !person}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-accent text-base font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Log entry"}
        </button>
      </form>
    </div>
  );
}
