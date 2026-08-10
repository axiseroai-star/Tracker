"use client";

import { useEffect, useState } from "react";

interface TargetsGroup {
  person: string;
  channels: { channel: string; dailyTarget: number; unit: string; archived: boolean }[];
}

export default function TargetsPage() {
  const [groups, setGroups] = useState<TargetsGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/targets")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load targets.");
        return res.json();
      })
      .then((json) => setGroups(json.groups))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load targets."));
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Targets</h1>
          <p className="text-sm text-ink-muted">Read-only here — edit numbers directly in Notion.</p>
        </div>
        {process.env.NEXT_PUBLIC_TARGETS_DATABASE_URL && (
          <a
            href={process.env.NEXT_PUBLIC_TARGETS_DATABASE_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-page"
          >
            Edit in Notion ↗
          </a>
        )}
      </header>

      {error && <p className="text-sm text-risk">{error}</p>}

      {!groups && !error && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-card" />
          ))}
        </div>
      )}

      {groups && (
        <div className="space-y-4">
          {groups.map((group) => {
            const activeChannels = group.channels.filter((c) => !c.archived);
            return (
              <div key={group.person} className="rounded-card border border-line bg-card p-5">
                <h2 className="mb-3 font-semibold text-ink">{group.person}</h2>
                {activeChannels.length === 0 ? (
                  <p className="text-sm text-ink-muted">No responsibilities yet for this person.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-muted">
                          <th className="pb-2 font-medium">Channel</th>
                          <th className="pb-2 font-medium">Daily target</th>
                          <th className="pb-2 font-medium">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeChannels.map((c) => (
                          <tr key={c.channel} className="border-t border-line">
                            <td className="py-2 text-ink">{c.channel}</td>
                            <td className="py-2 text-ink">{c.dailyTarget}</td>
                            <td className="py-2 text-ink-muted">{c.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
