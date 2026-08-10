"use client";

import { useEffect, useState } from "react";

interface TargetRow {
  id: string;
  channel: string;
  dailyTarget: number;
  unit: string;
}

interface TargetGroup {
  person: string;
  channels: TargetRow[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

function EditableTargetRow({ row }: { row: TargetRow }) {
  const [value, setValue] = useState(String(row.dailyTarget));
  const [state, setState] = useState<SaveState>("idle");

  async function commit() {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      setState("error");
      return;
    }
    if (num === row.dailyTarget) return;

    setState("saving");
    try {
      const res = await fetch(`/api/admin/targets/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyTarget: num }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to save.");
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  return (
    <tr>
      <td className="border-t border-line py-2 text-ink">{row.channel}</td>
      <td className="border-t border-line py-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          className="h-9 w-24 rounded-lg border border-line bg-page px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </td>
      <td className="border-t border-line py-2 text-ink-muted">{row.unit}</td>
      <td className="border-t border-line py-2 text-xs">
        {state === "saving" && <span className="text-ink-muted">Saving…</span>}
        {state === "saved" && <span className="text-good">Saved</span>}
        {state === "error" && <span className="text-risk">Failed to save</span>}
      </td>
    </tr>
  );
}

export default function AdminTargetsPanel() {
  const [groups, setGroups] = useState<TargetGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/targets")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load targets.");
        return res.json();
      })
      .then((json) => setGroups(json.groups))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load targets."));
  }, []);

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <p className="mb-4 text-xs text-ink-muted">
        Edit inline — changes save on blur. Members still see /targets as read-only.
      </p>
      {error && <p className="text-sm text-risk">{error}</p>}
      {!groups && !error && <div className="skeleton h-40 rounded-card" />}
      {groups && (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.person}>
              <h3 className="mb-2 text-sm font-semibold text-ink">{group.person}</h3>
              {group.channels.length === 0 ? (
                <p className="text-sm text-ink-muted">No target rows yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-muted">
                        <th className="pb-2 font-medium">Channel</th>
                        <th className="pb-2 font-medium">Daily target</th>
                        <th className="pb-2 font-medium">Unit</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.channels.map((row) => (
                        <EditableTargetRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
