import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCronSecretResponse } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard-data";
import { postToSlack } from "@/lib/slack";

/**
 * Weekly Slack digest (§16g) — the same team output/attainment/top-performer/
 * needs-attention figures already computed for the dashboard's KPI strip
 * (§5, via the same loadDashboard used by /api/dashboard), just posted to
 * Slack instead of only rendered in the browser.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecretResponse(request);
  if (denied) return denied;

  if (!process.env.SLACK_WEBHOOK_URL) {
    return NextResponse.json({ ok: true, skipped: true, reason: "SLACK_WEBHOOK_URL not configured." });
  }

  try {
    const dashboard = await loadDashboard();
    const { kpi } = dashboard;

    const needsAttention = dashboard.people.filter(
      (p) => p.attainmentPct !== null && p.attainmentPct < 70
    );

    const lines = [
      "*Axisero Output Tracker — weekly digest*",
      `Team output this week: *${kpi.teamOutputThisWeek.toLocaleString()}*` +
        (kpi.teamOutputDeltaPct !== null
          ? ` (${kpi.teamOutputDeltaPct >= 0 ? "▲" : "▼"} ${Math.abs(kpi.teamOutputDeltaPct)}% vs prior 7 days)`
          : ""),
      `Team average attainment: *${kpi.teamAvgAttainmentPct !== null ? `${kpi.teamAvgAttainmentPct}%` : "—"}*`,
      `Top performer: *${kpi.topPerformer ? `${kpi.topPerformer.person} (${kpi.topPerformer.attainmentPct}%)` : "—"}*`,
      needsAttention.length > 0
        ? `Below 70%: ${needsAttention.map((p) => `${p.person} (${p.attainmentPct}%)`).join(", ")}`
        : "Nobody below 70% attainment this week 🎉",
    ];

    await postToSlack(lines.join("\n"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Digest job failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Digest job failed." }, { status: 500 });
  }
}
