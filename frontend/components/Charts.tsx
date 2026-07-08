"use client";

const CHART_COLORS = {
  accent: "var(--accent)",
  spark: "var(--spark)",
  success: "var(--success)",
  danger: "var(--danger)",
} as const;

export type ChartColor = keyof typeof CHART_COLORS;

interface Series {
  name: string;
  color: ChartColor;
  values: number[];
}

/** Grouped bar chart — one group of bars per category, one bar per series.
 * Used for cash-flow-by-month and leads-by-channel-over-time. Pure SVG, no
 * charting dependency: this project has none installed and the datasets are
 * small (months / channels), so a hand-rolled chart is simpler than adding one.
 */
export function GroupedBarChart({
  categories,
  series,
  height = 180,
  formatValue = (v) => v.toLocaleString("ru-RU"),
}: {
  categories: string[];
  series: Series[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupWidth = 100 / Math.max(1, categories.length);
  const barWidth = groupWidth / (series.length + 1);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {categories.map((_, ci) =>
          series.map((s, si) => {
            const value = s.values[ci] ?? 0;
            const barHeight = (value / max) * (height - 24);
            const x = ci * groupWidth + si * barWidth + barWidth * 0.25;
            return (
              <rect
                key={`${ci}-${si}`}
                x={x}
                y={height - 20 - barHeight}
                width={barWidth * 0.7}
                height={barHeight}
                fill={CHART_COLORS[s.color]}
                opacity={0.85}
                rx={1.5}
              >
                <title>
                  {s.name} · {categories[ci]}: {formatValue(value)}
                </title>
              </rect>
            );
          })
        )}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-ink-faint">
        {categories.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-ink-dim">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[s.color] }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal proportional bar list — used for expense-by-category and the
 * manager revenue leaderboard, where ranking + magnitude matter more than
 * a time axis.
 */
export function HorizontalBars({
  items,
  formatValue = (v) => v.toLocaleString("ru-RU"),
  color = "accent",
}: {
  items: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  color?: ChartColor;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-ink-dim">{item.label}</span>
            <span className="font-mono-num text-ink">{formatValue(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: CHART_COLORS[color],
              }}
            />
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-center text-sm text-ink-faint">Пока пусто.</p>}
    </div>
  );
}
