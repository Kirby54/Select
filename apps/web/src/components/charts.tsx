"use client";

/**
 * Two small SVG charts, written by hand rather than adding a chart library:
 * AutonomyChart (finished vs. finished without a human, per day) and AmountChart (cost per day).
 * Both expose their numbers as a visually hidden table for screen readers.
 */
import { formatDay, money } from "@/lib/format";

export function AutonomyChart({ series }: { series: { day: string; finished: number; autonomous: number; errors: number }[] }) {
  if (series.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted">No finished task in this period yet.</p>;
  const max = Math.max(1, ...series.map((s) => s.finished));
  const height = 140;
  const barWidth = 100 / series.length;
  return (
    <figure className="px-4 pt-3 pb-2">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-36 w-full" aria-hidden>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="100" y1={height * f} y2={height * f} stroke="var(--color-line)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => {
          const x = i * barWidth + barWidth * 0.18;
          const w = barWidth * 0.64;
          const total = (s.finished / max) * (height - 6);
          const auto = (s.autonomous / max) * (height - 6);
          return (
            <g key={s.day}>
              <rect x={x} y={height - total} width={w} height={total} fill="var(--color-supervised)" opacity="0.55" rx="0.6" />
              <rect x={x} y={height - auto} width={w} height={auto} fill="var(--color-autonomous)" rx="0.6" />
              {s.errors > 0 && <rect x={x} y={height - total - 3} width={w} height="2" fill="var(--color-danger)" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-2xs text-faint tabular">
        <span>{formatDay(series[0]?.day)}</span>
        <span>{formatDay(series.at(-1)?.day)}</span>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-autonomous" aria-hidden />Finished without a human</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-supervised/60" aria-hidden />Finished after human review</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-2 bg-danger" aria-hidden />Day with an undetected error</span>
      </figcaption>
      <div className="sr-only"><table>
        <caption>Finished tasks per day</caption>
        <thead><tr><th>Day</th><th>Finished</th><th>Without a human</th><th>Undetected errors</th></tr></thead>
        <tbody>{series.map((s) => <tr key={s.day}><td>{s.day}</td><td>{s.finished}</td><td>{s.autonomous}</td><td>{s.errors}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}

export function AmountChart({ daily }: { daily: { day: string; amount: string }[] }) {
  if (daily.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted">No cost recorded in this period.</p>;
  // Display only: amounts are converted to numbers for bar heights, never for sums shown to the user.
  const values = daily.map((d) => Number(d.amount));
  const max = Math.max(...values, 0.000001);
  const height = 120;
  const w = 100 / daily.length;
  return (
    <figure className="px-4 pt-3 pb-2">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-32 w-full" aria-hidden>
        {daily.map((d, i) => {
          const h = (values[i]! / max) * (height - 4);
          return <rect key={d.day} x={i * w + w * 0.2} y={height - h} width={w * 0.6} height={h} fill="var(--color-accent)" opacity="0.8" rx="0.6" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-2xs text-faint tabular">
        <span>{formatDay(daily[0]?.day)}</span>
        <span>{formatDay(daily.at(-1)?.day)}</span>
      </div>
      <div className="sr-only"><table>
        <caption>Cost per day</caption>
        <tbody>{daily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{money(d.amount, "", 4)}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}
