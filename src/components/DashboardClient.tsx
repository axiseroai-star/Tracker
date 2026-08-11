"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import MissedTodayBanner from "@/components/MissedTodayBanner";
import WeeklyBarChart from "@/components/WeeklyBarChart";
import PersonCard from "@/components/PersonCard";
import ChannelMatrix from "@/components/ChannelMatrix";
import DailyBreakdownGrid from "@/components/DailyBreakdownGrid";
import PersonCommentsModal from "@/components/PersonCommentsModal";
import type { DashboardPerson, DashboardResult } from "@/lib/aggregate";

type SortMode = "attainment" | "name";

export default function DashboardClient({ person }: { person: string }) {
  const [data, setData] = useState<DashboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<DashboardPerson | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("attainment");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dashboard data.");
        return res.json();
      })
      .then((json: DashboardResult) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedPeople = useMemo(() => {
    if (!data) return [];
    const people = [...data.people];
    if (sortMode === "name") {
      people.sort((a, b) => a.person.localeCompare(b.person));
    }
    return people;
  }, [data, sortMode]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        {/* §14c: each person's 7-day window can differ by up to a day depending on
            their timezone/cutoff hour, so there's no one date range to show here anymore. */}
        <span
          className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink-muted"
          title="Each person's window is their own last 7 days, based on their timezone"
        >
          Rolling 7-day window
        </span>
      </header>

      {error && (
        <div className="mb-6 rounded-card border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
          {error}
        </div>
      )}

      {!data && !error && <DashboardSkeleton />}

      {data && (
        <>
          <div className="mb-6">
            <MissedTodayBanner names={data.missedToday} />
          </div>

          <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Team output this week"
              value={data.kpi.teamOutputThisWeek.toLocaleString()}
              delta={
                data.kpi.teamOutputDeltaPct === null ? null : { pct: data.kpi.teamOutputDeltaPct }
              }
              sublabel="vs previous 7 days"
            />
            <KpiCard
              label="Team avg attainment"
              value={data.kpi.teamAvgAttainmentPct === null ? "—" : `${data.kpi.teamAvgAttainmentPct}%`}
            />
            <KpiCard
              label="Top performer"
              value={data.kpi.topPerformer ? data.kpi.topPerformer.person : "—"}
              sublabel={
                data.kpi.topPerformer
                  ? `${data.kpi.topPerformer.attainmentPct}% attainment`
                  : undefined
              }
            />
            <KpiCard
              label="Needs attention"
              value={String(data.kpi.needsAttentionCount)}
              sublabel="below 70% attainment"
            />
          </section>

          {data.isEmpty ? (
            <EmptyState />
          ) : (
            <>
              <section className="mb-6 rounded-card border border-line bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold text-ink">Weekly output vs target</h2>
                <WeeklyBarChart people={data.people} />
              </section>

              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">By person</h2>
                  <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-1 text-xs">
                    <button
                      onClick={() => setSortMode("attainment")}
                      className={`rounded-md px-2.5 py-1 font-medium ${
                        sortMode === "attainment" ? "bg-accent-soft text-accent" : "text-ink-muted"
                      }`}
                    >
                      Attainment
                    </button>
                    <button
                      onClick={() => setSortMode("name")}
                      className={`rounded-md px-2.5 py-1 font-medium ${
                        sortMode === "name" ? "bg-accent-soft text-accent" : "text-ink-muted"
                      }`}
                    >
                      Name
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {sortedPeople.map((p) => (
                    <PersonCard key={p.person} person={p} onShowComments={() => setCommentsFor(p)} />
                  ))}
                </div>
              </section>

              <section className="mb-6 rounded-card border border-line bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold text-ink">Channel usage this week</h2>
                <ChannelMatrix cells={data.channelMatrix} />
              </section>

              <section className="rounded-card border border-line bg-card p-5">
                <h2 className="mb-1 text-sm font-semibold text-ink">Daily breakdown</h2>
                <p className="mb-4 text-xs text-ink-muted">
                  Each person&apos;s own last 7 days — click a cell to see which channels made up
                  that day&apos;s number.
                </p>
                <DailyBreakdownGrid people={sortedPeople} />
              </section>
            </>
          )}
        </>
      )}

      {commentsFor && (
        <PersonCommentsModal
          personName={commentsFor.person}
          comments={commentsFor.comments}
          sessionPerson={person}
          onClose={() => setCommentsFor(null)}
        />
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-line bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">No entries logged yet this week.</p>
      <p className="mt-1 text-sm text-ink-muted">
        Once the team starts logging, the chart and cards will fill in here.
      </p>
      <Link
        href="/log"
        className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        Log the first entry
      </Link>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-14 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-card" />
        ))}
      </div>
      <div className="skeleton h-72 rounded-card" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-card" />
        ))}
      </div>
    </div>
  );
}
