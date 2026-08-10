import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { queryAllPeople, queryAllTargets } from "@/lib/notion";
import { buildPersonChannelsMap } from "@/lib/aggregate";
import AdminClient from "@/components/AdminClient";

// Authoritative, server-side role check (§13a) — this runs even if someone
// reaches /admin directly, bypassing proxy.ts's optimistic redirect and any
// client-side nav-link hiding.
export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  // Same live roster/responsibilities data /log uses, for the "log for
  // anyone" form embedded in this page (§14b, §18).
  const [allPeople, targets] = await Promise.all([queryAllPeople(), queryAllTargets()]);
  const activePeople = allPeople.filter((p) => p.active);
  const people = activePeople.map((p) => ({ name: p.name, timezone: p.timezone }));
  const personChannels = buildPersonChannelsMap(activePeople, targets);

  return <AdminClient people={people} personChannels={personChannels} />;
}
