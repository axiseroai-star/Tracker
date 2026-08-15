import { redirect } from "next/navigation";
import PipelineBoard from "@/components/PipelineBoard";
import { getSession } from "@/lib/auth";
import { queryAllPeople, queryAllTargets } from "@/lib/notion";
import { channelsForPerson } from "@/lib/aggregate";
import { attachHasTouchToday, listLeads, listTouches, type LeadWithTouchToday } from "@/lib/pipeline-db";

// Server Component: resolves the session server-side (§20c), fetches leads
// and this BD's own loggable channels server-side, and hands both to the
// client board — same shape as /log resolving session + personChannels
// before rendering EntryForm.
export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy.ts already guarantees this in practice; defensive fallback.

  let leads: LeadWithTouchToday[] = [];
  let channels: string[] = [];
  let loadError: string | null = null;
  try {
    const [allLeads, allTouches, targets, people] = await Promise.all([
      listLeads(),
      listTouches(),
      queryAllTargets(),
      queryAllPeople(),
    ]);

    channels = channelsForPerson(session.person, targets);

    const timezoneByPerson = new Map(people.map((p) => [p.name, p.timezone]));
    leads = attachHasTouchToday(allLeads, allTouches, timezoneByPerson);
  } catch (error) {
    console.error(
      "Failed to load /pipeline data:",
      error instanceof Error ? error.message : "unknown error"
    );
    loadError = "Failed to load the pipeline. Try refreshing in a moment.";
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Sales Pipeline</h1>
        <p className="text-sm text-ink-muted">Named leads with proof, tracked from first touch to hand-off.</p>
      </div>
      {loadError ? (
        <p className="rounded-card border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
          {loadError}
        </p>
      ) : (
        <PipelineBoard
          initialLeads={leads}
          role={session.role}
          sessionPerson={session.person}
          channels={channels}
        />
      )}
    </main>
  );
}
