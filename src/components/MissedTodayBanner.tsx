export default function MissedTodayBanner({ names }: { names: string[] }) {
  if (names.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-card border border-risk/25 bg-risk-soft px-4 py-3">
      <span className="mt-0.5 text-risk" aria-hidden>
        ⚠
      </span>
      <p className="text-sm text-risk">
        <span className="font-semibold">Hasn&apos;t logged today:</span> {names.join(", ")}
      </p>
    </div>
  );
}
