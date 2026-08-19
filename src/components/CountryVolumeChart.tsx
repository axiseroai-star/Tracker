"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { countryDisplayLabel } from "@/lib/pipeline-countries";
import type { LeadWithTouchToday } from "@/lib/pipeline-db";

/**
 * Horizontal ranked bar chart of lead volume by country — same Recharts
 * setup/colors/card treatment as the "Leads added per BD this week" chart
 * above it in PipelineAnalytics.tsx. A ranked bar chart rather than a world
 * map: a small team's leads realistically cluster in a handful of
 * countries, and exact counts read far more precisely as ranked bars than
 * as map shading.
 */
export default function CountryVolumeChart({ leads }: { leads: LeadWithTouchToday[] }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const label =
        lead.country === null
          ? "Unspecified"
          : lead.country === "Other"
            ? "Other"
            : countryDisplayLabel(lead.country);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([country, count]) => ({ country, Leads: count }))
      .sort((a, b) => b.Leads - a.Leads || a.country.localeCompare(b.country));
  }, [leads]);

  if (data.length === 0) {
    return <p className="text-sm text-ink-muted">No leads with a country yet.</p>;
  }

  // Scales with the number of distinct countries — a fixed h-40 (right for
  // 2-3 BDs) would cramp a chart that could reasonably have a dozen bars.
  const chartHeight = Math.min(480, Math.max(120, data.length * 32));

  // Recharts' YAxis defaults interval to "preserveEnd" (confirmed in its
  // source, node_modules/recharts/es6/state/selectors/axisSelectors.js) —
  // it estimates whether adjacent tick labels would overlap and silently
  // drops the ones it thinks won't fit, recomputed (and inconsistent) on
  // every render. With labels this length-varied ("Spain" vs "Democratic
  // Republic of the Congo") that estimate is unreliable, which is exactly
  // why some labels only appeared after a hover forced a redraw. A fixed
  // width also isn't enough on its own — the longest label still needs
  // room, or it gets clipped by the SVG bounds regardless of interval.
  const longestLabelLength = Math.max(...data.map((d) => d.country.length));
  const yAxisWidth = Math.min(260, Math.max(100, longestLabelLength * 7 + 16));

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 32, left: 0, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#E5E7EB" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
          />
          <YAxis
            dataKey="country"
            type="category"
            width={yAxisWidth}
            interval={0}
            tick={{ fontSize: 12, fill: "#64748B" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#F7F8FA" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              fontSize: 12,
            }}
          />
          <Bar dataKey="Leads" fill="#4F46E5" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="Leads" position="right" style={{ fontSize: 12, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
