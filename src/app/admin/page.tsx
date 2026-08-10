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
  // anyone" form embedded in this page (§14b, §18). The Team/Entries/
  // Responsibilities sections below fetch their own data client-side and
  // degrade independently, so a failure here only takes out "log for
  // anyone" (via the banner), never the whole admin console.
  let people: { name: string; timezone: string }[] = [];
  let personChannels: Record<string, string[]> = {};
  let loadError: string | null = null;
  try {
    const [allPeople, targets] = await Promise.all([queryAllPeople(), queryAllTargets()]);
    const activePeople = allPeople.filter((p) => p.active);
    people = activePeople.map((p) => ({ name: p.name, timezone: p.timezone }));
    personChannels = buildPersonChannelsMap(activePeople, targets);
  } catch (error) {
    console.error(
      "Failed to load /admin roster data:",
      error instanceof Error ? error.message : "unknown error"
    );
    loadError = "Failed to load the team roster for the entry form below.";
  }

  return <AdminClient people={people} personChannels={personChannels} loadError={loadError} />;
}
