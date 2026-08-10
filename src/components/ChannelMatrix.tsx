import type { ChannelMatrixCell } from "@/lib/aggregate";
import { CHANNELS, PEOPLE } from "@/lib/constants";

/** Person x Channel heatmap — cell shade = output volume, dot = channel not in this person's lineup. */
export default function ChannelMatrix({ cells }: { cells: ChannelMatrixCell[] }) {
  const maxTotal = Math.max(...cells.map((c) => c.total), 1);
  const byKey = new Map(cells.map((c) => [`${c.person}__${c.channel}`, c]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-ink-muted">
              Person
            </th>
            {CHANNELS.map((channel) => (
              <th
                key={channel}
                className="whitespace-nowrap px-2 py-2 text-center text-[11px] font-medium text-ink-muted"
              >
                {channel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PEOPLE.map((person) => (
            <tr key={person}>
              <td className="sticky left-0 z-10 whitespace-nowrap border-t border-line bg-card px-3 py-2 text-left font-medium text-ink">
                {person}
              </td>
              {CHANNELS.map((channel) => {
                const cell = byKey.get(`${person}__${channel}`);
                const total = cell?.total ?? 0;
                const assigned = cell?.assigned ?? false;
                const intensity = assigned && total > 0 ? Math.min(total / maxTotal, 1) : 0;

                return (
                  <td key={channel} className="border-t border-line px-2 py-2 text-center">
                    {assigned ? (
                      <div
                        className="mx-auto flex h-7 min-w-10 items-center justify-center rounded-md text-xs font-medium"
                        style={{
                          backgroundColor:
                            total > 0
                              ? `rgba(79, 70, 229, ${0.12 + intensity * 0.68})`
                              : "var(--page-bg)",
                          color: intensity > 0.55 ? "#fff" : "var(--ink)",
                          border: total === 0 ? "1px dashed var(--line)" : undefined,
                        }}
                      >
                        {total > 0 ? total : "–"}
                      </div>
                    ) : (
                      <span className="text-line" aria-hidden>
                        ·
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
