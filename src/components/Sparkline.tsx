/** Tiny 7-bar daily trend, oldest -> newest. Plain SVG — overkill to pull in Recharts for this. */
export default function Sparkline({
  values,
  color = "#4F46E5",
}: {
  values: number[];
  color?: string;
}) {
  const width = 100;
  const height = 28;
  const max = Math.max(...values, 1);
  const barWidth = width / Math.max(values.length, 1);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="7-day output trend"
    >
      {values.map((v, i) => {
        const h = v > 0 ? Math.max((v / max) * height, 2) : 0;
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - h}
            width={Math.max(barWidth - 2, 1)}
            height={h}
            rx={1}
            fill={color}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
