"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { avatarColorForName } from "@/lib/constants";
import { formatDateLabel } from "@/lib/format";

interface TrendPerson {
  person: string;
  total: number;
  daily: { date: string; total: number }[];
}

type Range = 30 | 90;

export default function TrendsPage() {
  const [range, setRange] = useState<Range>(30);
  const [people, setPeople] = useState<TrendPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trends?days=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load trends.");
        return res.json();
      })
      .then((json) => setPeople(json.people))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trends."));
  }, [range]);

  function handleRangeChange(next: Range) {
    // Reset synchronously in the click handler (not the effect) so the
    // skeleton shows immediately instead of stale data from the old range.
    setRange(next);
    setPeople(null);
    setError(null);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Trends</h1>
          <p className="text-sm text-ink-muted">
            Per-person output over the last {range} days — beyond the dashboard&apos;s rolling
            7-day window.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-1 text-xs">
            {([30, 90] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  range === r ? "bg-accent-soft text-accent" : "text-ink-muted"
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            Dashboard →
          </Link>
        </div>
      </header>

      {error && <p className="text-sm text-risk">{error}</p>}

      {!people && !error && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-card" />
          ))}
        </div>
      )}

      {people && people.length === 0 && (
        <p className="text-sm text-ink-muted">No active team members yet.</p>
      )}

      {people && people.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {people.map((p) => (
            <div key={p.person} className="rounded-card border border-line bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-ink">{p.person}</h2>
                <p className="text-sm text-ink-muted">
                  <span className="font-semibold text-ink">{p.total.toLocaleString()}</span> total
                </p>
              </div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={p.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      interval={Math.max(Math.floor(p.daily.length / 6) - 1, 0)}
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={{ stroke: "#E5E7EB" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      cursor={{ fill: "#F7F8FA" }}
                      labelFormatter={(d) => formatDateLabel(String(d))}
                      contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill={avatarColorForName(p.person)} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
