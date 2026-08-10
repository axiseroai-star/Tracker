import StatusChip from "./StatusChip";
import Sparkline from "./Sparkline";
import type { DashboardPerson } from "@/lib/aggregate";

export default function PersonCard({
  person,
  onShowComments,
}: {
  person: DashboardPerson;
  onShowComments: () => void;
}) {
  const visibleTags = person.channelTags.slice(0, 3);
  const extra = person.channelTags.length - visibleTags.length;

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: person.avatarColor }}
            aria-hidden
          >
            {person.initials}
          </div>
          <div>
            <p className="font-semibold text-ink">{person.person}</p>
            <p className="text-xs text-ink-muted">
              {person.channelsActive} channel{person.channelsActive === 1 ? "" : "s"} active
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusChip statusKey={person.statusKey} />
          {person.commentCount > 0 && (
            <button
              type="button"
              onClick={onShowComments}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent hover:opacity-80"
              title={`View ${person.commentCount} comment${person.commentCount === 1 ? "" : "s"}`}
            >
              💬 {person.commentCount}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-bold text-ink">{person.weeklyTotal.toLocaleString()}</p>
          <p className="text-xs text-ink-muted">
            of {person.weeklyTargetTotal.toLocaleString()} target this week
            {person.attainmentPct !== null && ` · ${person.attainmentPct}%`}
          </p>
        </div>
        <div className="w-24 shrink-0">
          <Sparkline values={person.sparkline} color={person.avatarColor} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {visibleTags.map((c) => (
          <span
            key={c}
            className="rounded-full border border-line bg-page px-2 py-0.5 text-[11px] text-ink-muted"
          >
            {c}
          </span>
        ))}
        {extra > 0 && (
          <span className="rounded-full border border-line bg-page px-2 py-0.5 text-[11px] text-ink-muted">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
