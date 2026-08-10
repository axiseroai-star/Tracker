"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPerson } from "@/lib/aggregate";

/** Grouped bars per person (Target = light gray, Actual = accent). Server already sorts `people` by attainment desc. */
export default function WeeklyBarChart({ people }: { people: DashboardPerson[] }) {
  const data = people.map((p) => ({
    name: p.person.split(" ")[0],
    fullName: p.person,
    Target: p.weeklyTargetTotal,
    Actual: p.weeklyTotal,
  }));

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <Bar dataKey="Target" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual" fill="#4F46E5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#E5E7EB]" /> Target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Actual
        </span>
      </div>
    </div>
  );
}
