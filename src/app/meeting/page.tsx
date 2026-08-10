"use client";

import { useEffect, useState } from "react";
import WeeklyBarChart from "@/components/WeeklyBarChart";
import StatusChip from "@/components/StatusChip";
import type { DashboardResult } from "@/lib/aggregate";

const REFRESH_MS = 90_000;

/**
 * Meeting View (§16i) — a stripped-down dashboard built to survive being
 * shrunk into a Google Meet shared-screen window: a few big numbers, one
 * chart, one simple list. No nav, no buttons, no filters, no admin
 * controls, no dense multi-column tables. Auto-refreshes quietly.
 */
export default function MeetingPage() {
  const [data, setData] = useState<DashboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/dashboard")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load dashboard.");
          return res.json();
        })
        .then((json: DashboardResult) => {
          setData(json);
          setLastUpdated(new Date());
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard."));
    }
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const sortedPeople = data
    ? [...data.people].sort((a, b) => {
        if (a.attainmentPct === null && b.attainmentPct === null) return 0;
        if (a.attainmentPct === null) return 1;
        if (b.attainmentPct === null) return -1;
        return b.attainmentPct - a.attainmentPct;
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-10">
      <h1 className="mb-8 text-4xl font-bold tracking-tight text-ink">
        Axisero Output — This Week
      </h1>

      {error && <p className="text-xl text-risk">{error}</p>}

      {!data && !error && <p className="text-2xl text-ink-muted">Loading…</p>}

      {data && (
        <>
          <section className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="Team output" value={data.kpi.teamOutputThisWeek.toLocaleString()} />
            <Stat
              label="Avg attainment"
              value={data.kpi.teamAvgAttainmentPct !== null ? `${data.kpi.teamAvgAttainmentPct}%` : "—"}
            />
            <Stat label="Top performer" value={data.kpi.topPerformer?.person ?? "—"} small />
            <Stat label="Needs attention" value={String(data.kpi.needsAttentionCount)} />
          </section>

          {!data.isEmpty && (
            <section className="mb-10 rounded-card border border-line bg-card p-6">
              <WeeklyBarChart people={data.people} />
            </section>
          )}

          <section className="space-y-3">
            {sortedPeople.map((p) => (
              <div
                key={p.person}
                className="flex items-center justify-between rounded-card border border-line bg-card px-6 py-4"
              >
                <span className="text-2xl font-semibold text-ink">{p.person}</span>
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-bold text-ink">
                    {p.attainmentPct !== null ? `${p.attainmentPct}%` : "—"}
                  </span>
                  <StatusChip statusKey={p.statusKey} />
                </div>
              </div>
            ))}
          </section>

          {lastUpdated && (
            <p className="mt-8 text-sm text-ink-muted">
              Updated {lastUpdated.toLocaleTimeString()} · refreshes automatically
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-card p-6 text-center">
      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={small ? "text-2xl font-bold text-ink" : "text-4xl font-bold text-ink"}>{value}</p>
    </div>
  );
}
