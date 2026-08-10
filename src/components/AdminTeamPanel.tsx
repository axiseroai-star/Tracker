"use client";

import { useEffect, useState } from "react";

interface PersonRow {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  slackHandle: string | null;
  isAdmin: boolean;
  hasPin: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function TeamRow({ row, onChanged }: { row: PersonRow; onChanged: () => void }) {
  const [timezone, setTimezone] = useState(row.timezone);
  const [tzState, setTzState] = useState<SaveState>("idle");
  const [activeBusy, setActiveBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/people/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || "Failed to save.");
  }

  async function commitTimezone() {
    if (timezone === row.timezone) return;
    setTzState("saving");
    try {
      await patch({ timezone });
      setTzState("saved");
      onChanged();
      setTimeout(() => setTzState("idle"), 2000);
    } catch {
      setTzState("error");
    }
  }

  async function toggleActive() {
    setActiveBusy(true);
    try {
      await patch({ active: !row.active });
      onChanged();
    } catch {
      // surfaced via the list not updating; row-level errors aren't critical here
    } finally {
      setActiveBusy(false);
    }
  }

  async function resetPin() {
    if (!window.confirm(`Reset ${row.name}'s PIN? They'll set a new one on their next login.`)) {
      return;
    }
    setResetBusy(true);
    try {
      await patch({ resetPin: true });
      onChanged();
    } catch {
      // surfaced via the list not updating; row-level errors aren't critical here
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <tr className={row.active ? undefined : "opacity-50"}>
      <td className="border-t border-line py-2 pr-3 text-ink">
        {row.name}
        {row.isAdmin && (
          <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
            Admin
          </span>
        )}
      </td>
      <td className="border-t border-line py-2 pr-3">
        <input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          onBlur={commitTimezone}
          className="h-9 w-44 rounded-lg border border-line bg-page px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {tzState === "saving" && <span className="ml-2 text-xs text-ink-muted">Saving…</span>}
        {tzState === "saved" && <span className="ml-2 text-xs text-good">Saved</span>}
        {tzState === "error" && <span className="ml-2 text-xs text-risk">Failed</span>}
      </td>
      <td className="border-t border-line py-2 pr-3 text-ink-muted">{row.slackHandle || "—"}</td>
      <td className="border-t border-line py-2 pr-3">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] ${
            row.hasPin ? "bg-good-soft text-good" : "bg-none-soft text-none"
          }`}
        >
          {row.hasPin ? "Set" : "Not set"}
        </span>
      </td>
      <td className="border-t border-line py-2 text-right">
        <div className="flex justify-end gap-2">
          <button
            onClick={resetPin}
            disabled={resetBusy || !row.hasPin}
            className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-page disabled:opacity-50"
          >
            Reset PIN
          </button>
          <button
            onClick={toggleActive}
            disabled={activeBusy}
            className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-page disabled:opacity-50"
          >
            {row.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

const COMMON_TIMEZONES = ["Asia/Karachi", "Europe/Berlin", "Europe/London", "America/New_York", "UTC"];

export default function AdminTeamPanel() {
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/people")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load team.");
        return res.json();
      })
      .then((json) => setPeople(json.people))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load team."));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!name.trim() || !timezone.trim()) {
      setAddError("Name and timezone are both required.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), timezone: timezone.trim() }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to add team member.");
      setName("");
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add team member.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <form onSubmit={handleAdd} className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="h-10 w-48 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Timezone</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            list="tz-suggestions"
            placeholder="e.g. Asia/Karachi"
            className="h-10 w-48 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
          <datalist id="tz-suggestions">
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={adding}
          className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add team member"}
        </button>
        {addError && <p className="text-sm text-risk">{addError}</p>}
      </form>

      {error && <p className="text-sm text-risk">{error}</p>}
      {!people && !error && <div className="skeleton h-32 rounded-card" />}

      {people && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Timezone</th>
                <th className="pb-2 pr-3 font-medium">Slack handle</th>
                <th className="pb-2 pr-3 font-medium">PIN</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <TeamRow key={p.id} row={p} onChanged={load} />
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-muted">
            Deactivating someone removes them from /log, the dashboard, and the missed-today
            check — their history stays fully intact. New members need at least one
            responsibility added below before they can log anything. &ldquo;Reset PIN&rdquo;
            clears their PIN — a forgotten PIN just means asking you to reset it, then they
            set a new one on their next login. Admin status (the badge) is set directly in
            Notion&apos;s &ldquo;Is Admin&rdquo; field, not from here.
          </p>
        </div>
      )}
    </div>
  );
}
