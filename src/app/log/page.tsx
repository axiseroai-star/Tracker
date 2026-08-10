import Link from "next/link";
import EntryForm from "@/components/EntryForm";
import { getSession } from "@/lib/auth";
import { queryAllPeople, queryAllTargets } from "@/lib/notion";
import { buildPersonChannelsMap } from "@/lib/aggregate";

// Server Component: resolves role AND the live Active roster/responsibilities
// server-side (§14b, §18) — members get a locked, auto-filled date and a
// correct Person/Channel list on first paint, no client-side fetch/flash.
export default async function LogPage() {
  const session = await getSession();
  const role = session?.role ?? "member";

  const [allPeople, targets] = await Promise.all([queryAllPeople(), queryAllTargets()]);
  const activePeople = allPeople.filter((p) => p.active);
  const people = activePeople.map((p) => ({ name: p.name, timezone: p.timezone }));
  const personChannels = buildPersonChannelsMap(activePeople, targets);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Log output</h1>
          <p className="text-sm text-ink-muted">Add today&apos;s numbers for a channel.</p>
        </div>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Dashboard →
        </Link>
      </div>
      <EntryForm role={role} people={people} personChannels={personChannels} />
    </main>
  );
}
