"use client";

/**
 * Hand-made, quiet charts (no chart library): TaskWeek (a unit chart where every square is a finished task),
 * AutonomyChart (finished vs. finished without a human, per day) and AmountChart (cost per day).
 * Each one exposes its numbers as a visually hidden table, and never relies on colour alone.
 */
import { formatDay, money } from "@/lib/format";
import { cx } from "./ui/primitives";

type Day = { day: string; finished: number; autonomous: number; errors: number };

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

/**
 * The signature view: each square is a real finished task. Filled = finished without a human,
 * outlined = finished after a human review, crossed = an error a human found afterwards.
 */
export function TaskWeek({ series, className }: { series: Day[]; className?: string }) {
  const total = series.reduce((n, s) => n + s.finished, 0);
  if (series.length === 0 || total === 0) {
    return <p className={cx("px-4 py-10 text-center text-[13px] text-muted", className)}>No finished task in this period yet.</p>;
  }
  const most = Math.max(...series.map((s) => s.finished));
  const unit = Math.max(1, Math.ceil(most / 40)); // keep at most 40 squares per day
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(most / unit))));
  const rows = Math.max(2, Math.ceil(Math.ceil(most / unit) / cols));
  const cell = 13;
  const gap = 3;
  return (
    <figure className={cx("px-4 pt-4 pb-3", className)}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
        {series.map((s) => {
          const auto = Math.round(s.autonomous / unit);
          const reviewed = Math.round((s.finished - s.autonomous) / unit);
          const errors = Math.min(auto, Math.round(s.errors / unit));
          const squares = [
            ...Array.from({ length: auto }, (_, i) => (i < errors ? "error" : "auto")),
            ...Array.from({ length: reviewed }, () => "reviewed"),
          ];
          const date = new Date(s.day);
          return (
            <div key={s.day} className="flex min-w-0 flex-col items-center">
              <div
                role="img"
                aria-label={`${formatDay(s.day)}: ${s.finished} finished, ${s.autonomous} without a human, ${s.errors} undetected errors`}
                className="flex flex-wrap-reverse content-start justify-center"
                style={{ width: cols * cell + (cols - 1) * gap, height: rows * cell + (rows - 1) * gap, gap }}
              >
                {squares.map((kind, i) => (
                  <span
                    key={i}
                    className={cx(
                      "relative rounded-[3px]",
                      kind === "auto" && "bg-autonomous/85",
                      kind === "reviewed" && "border-[1.5px] border-supervised/80",
                      kind === "error" && "bg-autonomous/85 ring-2 ring-danger ring-offset-1 ring-offset-surface",
                    )}
                    style={{ width: cell, height: cell }}
                  />
                ))}
              </div>
              <div className="mt-2 text-center leading-tight">
                <div className="text-2xs font-medium text-muted">{weekday.format(date)}</div>
                <div className="text-2xs text-faint tabular">{s.finished}</div>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line-soft pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-autonomous/85" aria-hidden />Finished without a human</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] border-[1.5px] border-supervised/80" aria-hidden />After human review</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-autonomous/85 ring-2 ring-danger ring-offset-1 ring-offset-surface" aria-hidden />Error found afterwards</span>
        {unit > 1 && <span className="text-faint">1 square = {unit} tasks</span>}
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>Finished tasks per day</caption>
          <thead><tr><th>Day</th><th>Finished</th><th>Without a human</th><th>Undetected errors</th></tr></thead>
          <tbody>{series.map((s) => <tr key={s.day}><td>{s.day}</td><td>{s.finished}</td><td>{s.autonomous}</td><td>{s.errors}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

export function AutonomyChart({ series }: { series: Day[] }) {
  if (series.length === 0) return <p className="px-4 py-10 text-center text-[13px] text-muted">No finished task in this period yet.</p>;
  const max = Math.max(1, ...series.map((s) => s.finished));
  const height = 140;
  const barWidth = 100 / series.length;
  return (
    <figure className="px-4 pt-3 pb-2">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-36 w-full" aria-hidden>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="100" y1={height * f} y2={height * f} stroke="var(--color-line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => {
          const x = i * barWidth + barWidth * 0.22;
          const w = barWidth * 0.56;
          const total = (s.finished / max) * (height - 6);
          const auto = (s.autonomous / max) * (height - 6);
          return (
            <g key={s.day}>
              <rect x={x} y={height - total} width={w} height={total} fill="var(--color-supervised)" opacity="0.35" rx="0.8" />
              <rect x={x} y={height - auto} width={w} height={auto} fill="var(--color-autonomous)" opacity="0.9" rx="0.8" />
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
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-autonomous" aria-hidden />Finished without a human</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-supervised/40" aria-hidden />Finished after human review</span>
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

export function AmountChart({ daily, currency }: { daily: { day: string; amount: string }[]; currency?: string }) {
  if (daily.length === 0) return <p className="px-4 py-10 text-center text-[13px] text-muted">No cost recorded in this period.</p>;
  // Display only: amounts become numbers for bar heights, never for sums shown to the user.
  const values = daily.map((d) => Number(d.amount));
  const max = Math.max(...values, 0.000001);
  const peak = daily[values.indexOf(Math.max(...values))];
  const height = 120;
  const w = 100 / daily.length;
  return (
    <figure className="px-4 pt-3 pb-2">
      <div className="mb-1 flex justify-end text-2xs text-faint tabular">peak {money(peak?.amount ?? "0", currency, 4)}</div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-28 w-full" aria-hidden>
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {daily.map((d, i) => {
          const h = Math.max((values[i]! / max) * (height - 4), values[i]! > 0 ? 1.5 : 0);
          return <rect key={d.day} x={i * w + w * 0.22} y={height - h} width={w * 0.56} height={h} fill="var(--color-accent)" opacity="0.75" rx="0.8" />;
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
