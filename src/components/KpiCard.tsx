export default function KpiCard({
  label,
  value,
  delta,
  sublabel,
}: {
  label: string;
  value: string;
  delta?: { pct: number } | null;
  sublabel?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-card p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-2xl font-bold text-ink">{value}</p>
        {delta != null && (
          <span
            className={`text-xs font-medium ${delta.pct >= 0 ? "text-good" : "text-risk"}`}
          >
            {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct)}%
          </span>
        )}
      </div>
      {sublabel && <p className="mt-1 text-xs text-ink-muted">{sublabel}</p>}
    </div>
  );
}
