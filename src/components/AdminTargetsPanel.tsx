"use client";

import { useEffect, useMemo, useState } from "react";

interface TargetRow {
  id: string;
  channel: string;
  dailyTarget: number;
  unit: string;
  archived: boolean;
}

interface TargetGroup {
  person: string;
  channels: TargetRow[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

function EditableTargetRow({
  row,
  suggestion,
  onChanged,
}: {
  row: TargetRow;
  suggestion?: number;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(String(row.dailyTarget));
  const [state, setState] = useState<SaveState>("idle");
  const [archiveBusy, setArchiveBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/targets/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || "Failed to save.");
  }

  async function commit() {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      setState("error");
      return;
    }
    if (num === row.dailyTarget) return;

    setState("saving");
    try {
      await patch({ dailyTarget: num });
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  async function toggleArchived() {
    setArchiveBusy(true);
    try {
      await patch({ archived: !row.archived });
      onChanged();
    } catch {
      setArchiveBusy(false);
    }
  }

  return (
    <tr className={row.archived ? "opacity-50" : undefined}>
      <td className="border-t border-line py-2 pr-3 text-ink">{row.channel}</td>
      <td className="border-t border-line py-2 pr-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            className="h-9 w-24 rounded-lg border border-line bg-page px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {suggestion !== undefined && (
            <span className="whitespace-nowrap text-[11px] text-ink-muted">
              Recent avg: {suggestion}{" "}
              <button
                type="button"
                onClick={() => setValue(String(suggestion))}
                className="font-medium text-accent hover:underline"
              >
                Use suggestion
              </button>
            </span>
          )}
        </div>
      </td>
      <td className="border-t border-line py-2 pr-3 text-ink-muted">{row.unit}</td>
      <td className="border-t border-line py-2 pr-3 text-xs">
        {state === "saving" && <span className="text-ink-muted">Saving…</span>}
        {state === "saved" && <span className="text-good">Saved</span>}
        {state === "error" && <span className="text-risk">Failed to save</span>}
      </td>
      <td className="border-t border-line py-2 text-right">
        <button
          onClick={toggleArchived}
          disabled={archiveBusy}
          className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-page disabled:opacity-50"
        >
          {row.archived ? "Restore" : "Archive"}
        </button>
      </td>
    </tr>
  );
}

export default function AdminTargetsPanel({ people }: { people: string[] }) {
  const [groups, setGroups] = useState<TargetGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, Record<string, number>>>({});
  const [suggestionWindow, setSuggestionWindow] = useState(14);

  const [newPerson, setNewPerson] = useState(people[0] ?? "");
  const [newChannel, setNewChannel] = useState("");
  const [newDailyTarget, setNewDailyTarget] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function load() {
    fetch("/api/targets")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load targets.");
        return res.json();
      })
      .then((json) => setGroups(json.groups))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load targets."));
  }

  useEffect(load, []);

  useEffect(() => {
    fetch("/api/admin/target-suggestions")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) return;
        setSuggestions(json.averages ?? {});
        setSuggestionWindow(json.windowDays ?? 14);
      })
      .catch(() => {
        // Suggestions are a nice-to-have — silently skip if this fails.
      });
  }, []);

  const knownChannels = useMemo(() => {
    if (!groups) return [];
    const set = new Set<string>();
    for (const g of groups) for (const c of g.channels) set.add(c.channel);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const dailyTargetNum = Number(newDailyTarget);
    if (!newPerson) {
      setAddError("Person is required.");
      return;
    }
    if (!newChannel.trim()) {
      setAddError("Channel is required.");
      return;
    }
    if (newDailyTarget.trim() === "" || !Number.isFinite(dailyTargetNum) || dailyTargetNum < 0) {
      setAddError("Daily target must be a number ≥ 0.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person: newPerson,
          channel: newChannel.trim(),
          dailyTarget: dailyTargetNum,
          unit: newUnit.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to add responsibility.");
      setNewChannel("");
      setNewDailyTarget("");
      setNewUnit("");
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add responsibility.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <form onSubmit={handleAdd} className="mb-5 flex flex-wrap items-end gap-3 border-b border-line pb-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Person</label>
          <select
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            className="h-10 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          >
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Channel</label>
          <input
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            list="channel-suggestions"
            placeholder="Pick or type a new one"
            className="h-10 w-52 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
          <datalist id="channel-suggestions">
            {knownChannels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Daily target</label>
          <input
            type="number"
            min={0}
            value={newDailyTarget}
            onChange={(e) => setNewDailyTarget(e.target.value)}
            className="h-10 w-28 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Unit</label>
          <input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="e.g. emails sent"
            className="h-10 w-40 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
        </div>
        <button
          type="submit"
          disabled={adding || people.length === 0}
          className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add responsibility"}
        </button>
        {addError && <p className="text-sm text-risk">{addError}</p>}
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Show archived
        </label>
        <p className="text-xs text-ink-muted">
          &ldquo;Recent avg&rdquo; = average daily output over the last {suggestionWindow} days.
        </p>
      </div>

      {error && <p className="text-sm text-risk">{error}</p>}
      {!groups && !error && <div className="skeleton h-40 rounded-card" />}
      {groups && (
        <div className="space-y-6">
          {groups.map((group) => {
            const visible = group.channels.filter((c) => showArchived || !c.archived);
            return (
              <div key={group.person}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{group.person}</h3>
                {visible.length === 0 ? (
                  <p className="text-sm text-ink-muted">No responsibilities yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-muted">
                          <th className="pb-2 pr-3 font-medium">Channel</th>
                          <th className="pb-2 pr-3 font-medium">Daily target</th>
                          <th className="pb-2 pr-3 font-medium">Unit</th>
                          <th className="pb-2 pr-3 font-medium"></th>
                          <th className="pb-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((row) => (
                          <EditableTargetRow
                            key={row.id}
                            row={row}
                            suggestion={suggestions[group.person]?.[row.channel]}
                            onChanged={load}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
