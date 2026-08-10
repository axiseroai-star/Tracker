"use client";

import EntryForm, { type EntryFormPerson } from "@/components/EntryForm";
import AdminEntriesTable from "@/components/AdminEntriesTable";
import AdminTargetsPanel from "@/components/AdminTargetsPanel";
import AdminTeamPanel from "@/components/AdminTeamPanel";

export default function AdminClient({
  sessionPerson,
  people,
  personChannels,
  loadError,
}: {
  /** The logged-in admin's own name (§20) — used as Author on comments left from here. */
  sessionPerson: string;
  people: EntryFormPerson[];
  personChannels: Record<string, string[]>;
  loadError?: string | null;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Admin</h1>
        <p className="text-sm text-ink-muted">
          Team, responsibilities, full history, comments, and targets.
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Team</h2>
        <AdminTeamPanel />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Log for anyone</h2>
        {loadError ? (
          <p className="max-w-lg rounded-card border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {loadError}
          </p>
        ) : (
          <div className="max-w-lg">
            <EntryForm mode="any" people={people} personChannels={personChannels} />
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">All entries</h2>
        <AdminEntriesTable sessionPerson={sessionPerson} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Responsibilities &amp; targets</h2>
        <AdminTargetsPanel people={people.map((p) => p.name)} />
      </section>
    </main>
  );
}
