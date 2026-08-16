"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "./KpiCard";
import { COLUMNS } from "./PipelineBoard";
import type { LeadWithTouchToday } from "@/lib/pipeline-db";

/**
 * Monday-based "this week" boundary, computed in UTC-calendar terms (same
 * date-string-arithmetic style lib/aggregate.ts uses for its own date math).
 * Deliberately not lib/aggregate.ts's rollingWindow()/effectiveDate() — those
 * anchor to each *BD's own timezone*, which isn't part of the leads payload
 * this page already fetches, and pulling it in would mean a second query
 * this feature is meant to avoid. A plain Monday-Sunday UTC week is a
 * reasonable, timezone-agnostic stand-in for a lightweight chart like this.
 */
function mondayOfWeek(todayISO: string): string {
  const d = new Date(`${todayISO}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + deltaToMonday);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function PipelineAnalytics({ leads }: { leads: LeadWithTouchToday[] }) {
  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const column of COLUMNS) counts.set(column, 0);
    for (const lead of leads) {
      if (counts.has(lead.status)) counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
    }
    return counts;
  }, [leads]);

  const weeklyByOwner = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const weekStart = mondayOfWeek(todayISO);
    const weekEnd = addDaysISO(weekStart, 6);

    const counts = new Map<string, number>();
    for (const lead of leads) {
      const createdISO = lead.createdAt.slice(0, 10);
      if (createdISO < weekStart || createdISO > weekEnd) continue;
      counts.set(lead.owner, (counts.get(lead.owner) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([owner, count]) => ({ name: owner.split(" ")[0], fullName: owner, Leads: count }))
      .sort((a, b) => b.Leads - a.Leads || a.fullName.localeCompare(b.fullName));
  }, [leads]);

  return (
    <div className="mb-6 space-y-4">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Funnel</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {COLUMNS.map((stage) => (
            <KpiCard key={stage} label={stage} value={String(stageCounts.get(stage) ?? 0)} />
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink">Leads added per BD this week</h2>
        {weeklyByOwner.length === 0 ? (
          <p className="text-sm text-ink-muted">No leads added yet this week.</p>
        ) : (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyByOwner} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  axisLine={{ stroke: "#E5E7EB" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "#F7F8FA" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    fontSize: 12,
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                />
                <Bar dataKey="Leads" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
