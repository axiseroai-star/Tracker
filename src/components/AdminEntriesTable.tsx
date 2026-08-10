"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyLogEntry } from "@/lib/aggregate";
import { CHANNELS, PEOPLE, type Channel, type Person } from "@/lib/constants";
import { downloadCsv, toCsv } from "@/lib/format";
import CommentPanel from "./CommentPanel";

type SortKey = "date" | "person" | "channel" | "outputCount";

const PAGE_LABEL: Record<SortKey, string> = {
  date: "Date",
  person: "Person",
  channel: "Channel",
  outputCount: "Output",
};

export default function AdminEntriesTable() {
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [personFilter, setPersonFilter] = useState<Person | "All">("All");
  const [channelFilter, setChannelFilter] = useState<Channel | "All">("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [commentTarget, setCommentTarget] = useState<DailyLogEntry | null>(null);

  function load() {
    fetch("/api/admin/entries")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load entries.");
        return res.json();
      })
      .then((json) => setEntries(json.entries))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load entries."));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!entries) return [];
    let rows = entries.filter((e) => (showArchived ? true : !e.archived));
    if (personFilter !== "All") rows = rows.filter((e) => e.person === personFilter);
    if (channelFilter !== "All") rows = rows.filter((e) => e.channel === channelFilter);
    if (dateFrom) rows = rows.filter((e) => e.date >= dateFrom);
    if (dateTo) rows = rows.filter((e) => e.date <= dateTo);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "outputCount") return (a.outputCount - b.outputCount) * dir;
      return a[sortKey].localeCompare(b[sortKey]) * dir;
    });
  }, [entries, personFilter, channelFilter, dateFrom, dateTo, showArchived, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  async function patchEntry(entry: DailyLogEntry, patch: { archived?: boolean; flagged?: boolean }) {
    setBusyId(entry.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/entries/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Failed to update entry.");
      setEntries((prev) =>
        prev ? prev.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)) : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry.");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const csv = toCsv(
      ["Person", "Channel", "Date", "Output Count", "Notes", "Archived", "Flagged"],
      filtered.map((e) => [
        e.person,
        e.channel,
        e.date,
        e.outputCount,
        e.notes ?? "",
        e.archived ? "yes" : "no",
        e.flagged ? "yes" : "no",
      ])
    );
    downloadCsv(`axisero-daily-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Person</label>
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value as Person | "All")}
            className="h-10 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          >
            <option value="All">All</option>
            {PEOPLE.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Channel</label>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as Channel | "All")}
            className="h-10 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          >
            <option value="All">All</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-lg border border-line bg-page px-2.5 text-sm text-ink"
          />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Show archived
        </label>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="ml-auto h-10 rounded-lg border border-line bg-page px-3 text-sm font-medium text-ink hover:bg-page disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-risk">{error}</p>}
      {!entries && !error && <div className="skeleton h-40 rounded-card" />}

      {entries && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {(["date", "person", "channel", "outputCount"] as SortKey[]).map((key) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    {PAGE_LABEL[key]} {sortKey === key && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium text-ink-muted">Notes</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-ink-muted">
                    No entries match these filters.
                  </td>
                </tr>
              )}
              {filtered.map((entry) => (
                <tr key={entry.id} className={entry.archived ? "opacity-50" : undefined}>
                  <td className="whitespace-nowrap border-t border-line px-3 py-2 text-ink">
                    {entry.date}
                  </td>
                  <td className="whitespace-nowrap border-t border-line px-3 py-2 text-ink">
                    {entry.person}
                  </td>
                  <td className="whitespace-nowrap border-t border-line px-3 py-2 text-ink">
                    {entry.channel}
                    {entry.flagged && <span className="ml-1" title="Flagged">🚩</span>}
                  </td>
                  <td className="whitespace-nowrap border-t border-line px-3 py-2 text-ink">
                    {entry.outputCount}
                  </td>
                  <td className="max-w-[220px] truncate border-t border-line px-3 py-2 text-ink-muted">
                    {entry.notes || "—"}
                  </td>
                  <td className="whitespace-nowrap border-t border-line px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setCommentTarget(entry)}
                        className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-page"
                      >
                        Comment
                      </button>
                      <button
                        onClick={() => patchEntry(entry, { flagged: !entry.flagged })}
                        disabled={busyId === entry.id}
                        className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-page disabled:opacity-50"
                      >
                        {entry.flagged ? "Unflag" : "Flag"}
                      </button>
                      <button
                        onClick={() => patchEntry(entry, { archived: !entry.archived })}
                        disabled={busyId === entry.id}
                        className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-page disabled:opacity-50"
                      >
                        {entry.archived ? "Restore" : "Archive"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {commentTarget && (
        <CommentPanel
          logEntryId={commentTarget.id}
          title={`${commentTarget.person} — ${commentTarget.channel} — ${commentTarget.date}`}
          onClose={() => setCommentTarget(null)}
        />
      )}
    </div>
  );
}
