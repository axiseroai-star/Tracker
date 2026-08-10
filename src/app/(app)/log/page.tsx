import { redirect } from "next/navigation";
import EntryForm from "@/components/EntryForm";
import { getSession } from "@/lib/auth";
import { queryAllPeople, queryAllTargets } from "@/lib/notion";
import { buildPersonChannelsMap } from "@/lib/aggregate";

// Server Component: resolves the verified session identity AND the live
// Active roster/responsibilities server-side (§14b, §18, §20c) — Person is
// always the logged-in identity here, shown as a fixed label with a locked
// date, correct on first paint with no client-side fetch/flash.
export default async function LogPage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy.ts already guarantees this in practice; defensive fallback.

  let people: { name: string; timezone: string }[] = [];
  let personChannels: Record<string, string[]> = {};
  let loadError: string | null = null;
  try {
    const [allPeople, targets] = await Promise.all([queryAllPeople(), queryAllTargets()]);
    const activePeople = allPeople.filter((p) => p.active);
    people = activePeople.map((p) => ({ name: p.name, timezone: p.timezone }));
    personChannels = buildPersonChannelsMap(activePeople, targets);
  } catch (error) {
    // Never let a Notion hiccup take down the whole page with Next's default
    // error boundary — degrade to a plain message, same as every API route.
    console.error(
      "Failed to load /log data:",
      error instanceof Error ? error.message : "unknown error"
    );
    loadError = "Failed to load the team roster. Try refreshing in a moment.";
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Log output</h1>
        <p className="text-sm text-ink-muted">Add today&apos;s numbers for a channel.</p>
      </div>
      {loadError ? (
        <p className="rounded-card border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
          {loadError}
        </p>
      ) : (
        <EntryForm
          mode="self"
          sessionPerson={session.person}
          people={people}
          personChannels={personChannels}
        />
      )}
    </main>
  );
}
