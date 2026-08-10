import { STATUS, type StatusKey } from "@/lib/constants";

// Literal class strings (no runtime string-building) so Tailwind's scanner
// can find and generate every one of these utilities.
const STYLE: Record<StatusKey, { chip: string; text: string; dot: string }> = {
  ON_TRACK: { chip: "bg-good-soft", text: "text-good", dot: "bg-good" },
  BEHIND: { chip: "bg-behind-soft", text: "text-behind", dot: "bg-behind" },
  AT_RISK: { chip: "bg-risk-soft", text: "text-risk", dot: "bg-risk" },
  NO_TARGET: { chip: "bg-none-soft", text: "text-none", dot: "bg-none" },
};

export default function StatusChip({ statusKey }: { statusKey: StatusKey }) {
  const style = STYLE[statusKey];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.chip} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {STATUS[statusKey].label}
    </span>
  );
}
