"use client";

import { useState } from "react";
import { formatDateLabel } from "@/lib/format";
import type { DashboardPerson } from "@/lib/aggregate";
import type { StatusKey } from "@/lib/constants";

/**
 * §23 "Daily breakdown grid" — rows = people, columns = the last 7 days,
 * each row computed from that person's own effectiveDate (§14), not one
 * shared date axis: two rows can genuinely show different calendar dates in
 * the same column when their timezones straddle the day-cutoff differently.
 * Column headers are therefore relative ("6d ago" … "Today") rather than
 * fixed dates; each cell's actual date is in its tooltip and its expanded
 * detail.
 */
const COLUMN_LABELS = ["6d ago", "5d ago", "4d ago", "3d ago", "2d ago", "Yesterday", "Today"];

// Literal class strings (no runtime string-building), same convention as
// StatusChip, so Tailwind's scanner can find and generate every utility.
const CELL_STYLE: Record<StatusKey | "NO_ENTRIES", { chip: string; text: string }> = {
  ON_TRACK: { chip: "bg-good-soft", text: "text-good" },
  BEHIND: { chip: "bg-behind-soft", text: "text-behind" },
  AT_RISK: { chip: "bg-risk-soft", text: "text-risk" },
  NO_TARGET: { chip: "bg-none-soft", text: "text-none" },
  // A distinct neutral (dashed, page-colored) rather than reusing any status
  // color — matches ChannelMatrix's own "nothing here" convention — so a
  // no-entries day never reads as a graded 0% (red).
  NO_ENTRIES: { chip: "border border-dashed border-line bg-page", text: "text-ink-muted" },
};

export default function DailyBreakdownGrid({ people }: { people: DashboardPerson[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (people.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing to show yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-ink-muted">
              Person
            </th>
            {COLUMN_LABELS.map((label) => (
              <th
                key={label}
                className="whitespace-nowrap px-2 py-2 text-center text-[11px] font-medium text-ink-muted"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.person}>
              <td className="sticky left-0 z-10 whitespace-nowrap border-t border-line bg-card px-3 py-2 text-left font-medium text-ink">
                {person.person}
              </td>
              {person.dailyBreakdown.map((day) => {
                const key = `${person.person}__${day.date}`;
                const isOpen = expandedKey === key;
                const style = CELL_STYLE[day.statusKey];

                return (
                  <td key={day.date} className="border-t border-line px-2 py-2 text-center align-top">
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isOpen ? null : key)}
                      aria-expanded={isOpen}
                      title={formatDateLabel(day.date)}
                      className={`mx-auto flex h-9 min-w-16 flex-col items-center justify-center rounded-md px-1 text-[11px] font-medium leading-tight ${style.chip} ${style.text}`}
                    >
                      {day.hasEntries ? (
                        <>
                          <span>
                            {day.actual}/{day.target || "–"}
                          </span>
                          {day.attainmentPct !== null && (
                            <span className="text-[10px] opacity-80">{day.attainmentPct}%</span>
                          )}
                        </>
                      ) : (
                        <span aria-hidden>–</span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="mx-auto mt-1.5 min-w-[7rem] max-w-[9rem] rounded-lg border border-line bg-page p-2 text-left">
                        <p className="mb-1 text-[10px] font-semibold text-ink-muted">
                          {formatDateLabel(day.date)}
                        </p>
                        {day.channels.length === 0 ? (
                          <p className="text-[11px] text-ink-muted">No entries logged.</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {day.channels.map((c) => (
                              <li
                                key={c.channel}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <span className="truncate text-ink-muted">{c.channel}</span>
                                <span className="shrink-0 font-medium text-ink">{c.outputCount}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
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
