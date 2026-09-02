import { formatMoney } from "@/lib/core/money";

/**
 * 14-day collection bars. Inline SVG, no chart library: a school laptop should
 * not download 90 kB of JavaScript to see seven bars.
 */
export function CollectionSpark({
  data,
}: {
  data: Array<{ date: string; amount: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  const width = 100;
  const height = 34;
  const gap = 1.6;
  const barWidth = (width - gap * (data.length - 1)) / data.length;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" role="img"
        aria-label={`Collection over the last ${data.length} days`}>
        {data.map((d, i) => {
          const h = Math.max(d.amount > 0 ? 1.5 : 0.6, (d.amount / max) * height);
          const isToday = i === data.length - 1;
          return (
            <rect
              key={d.date}
              x={i * (barWidth + gap)}
              y={height - h}
              width={barWidth}
              height={h}
              rx={0.8}
              fill={isToday ? "var(--color-brand)" : d.amount > 0 ? "var(--color-brand)" : "var(--color-line-2)"}
              opacity={isToday ? 1 : d.amount > 0 ? 0.42 : 0.5}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3">
        <span>14 days ago</span>
        <span className="tnum">Peak {formatMoney(max)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** Horizontal ageing bar for the dues buckets. */
export function AgeingBar({
  buckets,
}: {
  buckets: Record<string, number>;
}) {
  const order = ["CURRENT", "1-30", "31-60", "61-90", "90+"] as const;
  const colors: Record<string, string> = {
    CURRENT: "var(--color-line-2)",
    "1-30": "var(--color-marigold)",
    "31-60": "var(--color-amber-deep)",
    "61-90": "var(--color-rust)",
    "90+": "var(--color-overdue)",
  };
  const total = order.reduce((a, k) => a + (buckets[k] ?? 0), 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {order.map((k) => {
          const value = buckets[k] ?? 0;
          if (value === 0) return null;
          return (
            <div
              key={k}
              style={{ width: `${(value / total) * 100}%`, background: colors[k] }}
              title={`${k}: ${formatMoney(value)}`}
            />
          );
        })}
      </div>
      <dl className="mt-2.5 grid grid-cols-5 gap-1 text-center">
        {order.map((k) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[9.5px] font-semibold text-ink-3 uppercase sm:text-[10.5px] sm:tracking-wide">
              {k === "CURRENT" ? "not due" : `${k}d`}
            </dt>
            <dd className="tnum truncate text-[11px] font-semibold sm:text-[12.5px]">
              {buckets[k] ? formatMoney(buckets[k]) : "—"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
