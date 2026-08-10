import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/dashboard-data";

/**
 * Four Notion queries per load: Daily Log, Targets (cached), visible
 * Comments (§13d/§16d), and People (cached, §18) — never a loop per
 * person/channel/entry. See lib/dashboard-data.ts for the query/aggregate.
 */
export async function GET() {
  try {
    const dashboard = await loadDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error(
      "Failed to build dashboard:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 }
    );
  }
}
