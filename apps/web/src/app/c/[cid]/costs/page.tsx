"use client";

import { AlertTriangle, CircleDollarSign } from "lucide-react";

import { AmountChart } from "@/components/charts";
import { CostMetric } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Card, CardHeader, DemoTag, Progress, Segmented, Skeleton, Switch, cx } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { useCompany, useCompanyId, useCosts, usePersistentState } from "@/lib/queries";
import type { CostRow } from "@/lib/types";

/** A breakdown as a ranked list with a quiet share bar: readable at a glance, exact on the right. */
function Breakdown({ title, rows, currency, total }: { title: string; rows: CostRow[]; currency: string; total: number }) {
  const max = Math.max(...rows.map((r) => Number(r.amount)), 0);
  return (
    <Card aria-label={title} className="min-w-0">
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-faint">Nothing recorded in this period.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.slice(0, 8).map((r) => {
            const amount = Number(r.amount);
            return (
              <li key={`${r.key}-${r.label}`} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-fg">{r.label}</span>
                  <span className="shrink-0 tabular text-fg">{money(r.amount, currency, 4)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                    <span className="block h-full rounded-full bg-accent/70" style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%` }} />
                  </span>
                  <span className="w-28 shrink-0 text-right text-2xs text-faint tabular" title="Tokens in / out">
                    {total > 0 ? `${Math.round((amount / total) * 100)} % · ` : ""}{r.events} call{r.events === 1 ? "" : "s"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function CostsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [days, setDays] = usePersistentState<number>("costs.days", 30);
  const [includeDemo, setIncludeDemo] = usePersistentState<boolean>("costs.demo", true);
  const costs = useCosts(cid, days, includeDemo);
  const isDemo = !!company.data?.is_demo;

  const header = (
    <PageHeader
      title="Costs"
      description={costs.data?.kind_note ?? "Spend, budgets and cost per verified result"}
      actions={
        <>
          {isDemo && (
            <label className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-muted">
              <Switch checked={includeDemo} onCheckedChange={setIncludeDemo} label="Include demo costs" />
              <span aria-hidden>Include demo</span>
            </label>
          )}
          <Segmented label="Period" value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
        </>
      }
    />
  );

  if (costs.isPending) {
    return <>{header}<PageBody><Skeleton className="h-64 rounded-xl" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div></PageBody></>;
  }
  if (costs.isError) return <>{header}<ErrorState error={costs.error} retry={() => void costs.refetch()} /></>;
  const c = costs.data;
  const currency = c.currency;
  const total = Number(c.total);
  const budget = Number(c.budget.monthly);
  const spent = Number(c.budget.spent_live_this_month);
  const demoIncluded = isDemo && includeDemo;

  return (
    <>
      {header}
      <PageBody>
        {c.alerts.map((a) => (
          <div key={a.message} role="alert" className={cx("flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px]", a.level === "critical" ? "border-danger/35 bg-danger/8 text-danger" : "border-warning/35 bg-warning/8 text-warning")}>
            <AlertTriangle className="size-4 shrink-0" aria-hidden />{a.message}
          </div>
        ))}
        <Card aria-label="Spend summary">
          <div className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-line-soft lg:[&>*:not(:last-child)]:border-r max-lg:[&>*:nth-child(odd)]:border-r max-lg:[&>*:nth-child(n+3)]:border-t">
            <div className="relative">
              <CostMetric label={`Total, last ${c.period_days} days`} amount={c.total} currency={currency} kind="estimated" />
              {demoIncluded && <DemoTag className="absolute top-3 right-4" />}
            </div>
            <CostMetric label="Per verified result" amount={c.cost_per_verified_result} currency={currency} kind="estimated" hint={`${c.verified_results} verified results`} />
            <div className="min-w-0 px-4 py-3">
              <div className="text-xs text-muted">Live spend this month</div>
              <div className="mt-1 text-[22px] leading-7 font-bold tracking-[-0.02em] tabular">{money(c.budget.spent_live_this_month, currency, 2)}</div>
              {budget > 0 ? (
                <Progress className="mt-2" value={spent} max={budget} tone={spent / budget > 0.9 ? "danger" : spent / budget > 0.7 ? "supervised" : "accent"} label="Monthly budget used" />
              ) : (
                <div className="mt-0.5 text-xs text-faint">No monthly budget</div>
              )}
            </div>
            <div className="min-w-0 px-4 py-3">
              <div className="text-xs text-muted">Monthly budget</div>
              <div className="mt-1 text-[22px] leading-7 font-bold tracking-[-0.02em] tabular">{budget > 0 ? money(c.budget.monthly, currency, 0) : "Not set"}</div>
              <div className="mt-0.5 text-xs text-faint">Live runs stop when it is reached</div>
            </div>
          </div>
          <div className="border-t border-line-soft">
            <div className="flex items-center justify-between px-4 pt-3 text-xs text-muted">
              <span>Per day</span>
              <span className="text-faint">estimated from provider token counts</span>
            </div>
            <AmountChart daily={c.daily} currency={currency} />
          </div>
        </Card>
        {total === 0 && c.by_agent.length === 0 ? (
          <Card>
            <EmptyState icon={<CircleDollarSign />} title="No cost recorded yet" description="Costs appear with the first live run. Demo runs are recorded apart and never billed." />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <Breakdown title="By agent" rows={c.by_agent} currency={currency} total={total} />
            <Breakdown title="By model" rows={c.by_model} currency={currency} total={total} />
            <Breakdown title="By project" rows={c.by_project} currency={currency} total={total} />
            <Breakdown title="By provider" rows={c.by_provider} currency={currency} total={total} />
            <Breakdown title="Most expensive tasks" rows={c.by_task} currency={currency} total={total} />
            <Breakdown title="Live or recorded" rows={c.by_kind} currency={currency} total={total} />
          </div>
        )}
      </PageBody>
    </>
  );
}
