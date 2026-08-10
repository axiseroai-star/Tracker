"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import EntryForm, { type EntryFormPerson } from "@/components/EntryForm";
import AdminEntriesTable from "@/components/AdminEntriesTable";
import AdminTargetsPanel from "@/components/AdminTargetsPanel";
import AdminTeamPanel from "@/components/AdminTeamPanel";

export default function AdminClient({
  people,
  personChannels,
}: {
  people: EntryFormPerson[];
  personChannels: Record<string, string[]>;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Admin</h1>
          <p className="text-sm text-ink-muted">
            Team, responsibilities, full history, comments, and targets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/trends" className="text-sm font-medium text-ink-muted hover:text-ink">
            Trends
          </Link>
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            Dashboard →
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-ink-muted hover:text-ink"
          >
            Log out
          </button>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Team</h2>
        <AdminTeamPanel />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Log for anyone</h2>
        <div className="max-w-lg">
          <EntryForm role="admin" people={people} personChannels={personChannels} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">All entries</h2>
        <AdminEntriesTable />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Responsibilities &amp; targets</h2>
        <AdminTargetsPanel people={people.map((p) => p.name)} />
      </section>
    </main>
  );
}
