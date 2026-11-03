"use client";

import { AlertTriangle } from "lucide-react";

import { AmountChart } from "@/components/charts";
import { CostMetric } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data";
import { ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Card, CardHeader, Checkbox, Select } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { useCompany, useCompanyId, useCosts, usePersistentState } from "@/lib/queries";
import type { CostRow } from "@/lib/types";

function Breakdown({ title, rows }: { title: string; rows: CostRow[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? <p className="px-4 py-6 text-sm text-muted">Nothing recorded.</p> : (
        <DataTable caption={title} rows={rows} rowKey={(r) => `${r.key}`} columns={[
          { key: "label", header: "Name", cell: (r) => <span className="text-fg">{r.label}</span> },
          { key: "tokens", header: "Tokens in / out", cell: (r) => <span className="text-muted tabular">{r.input_tokens.toLocaleString("en")} / {r.output_tokens.toLocaleString("en")}</span>, hideOnMobile: true, align: "right" },
          { key: "amount", header: "Amount", cell: (r) => <span className="tabular">{money(r.amount, "", 4)}</span>, align: "right" },
        ]} />
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
  if (costs.isPending) return <LoadingRows rows={8} />;
  if (costs.isError) return <ErrorState error={costs.error} retry={() => void costs.refetch()} />;
  const c = costs.data;
  return (
    <>
      <PageHeader
        title="Costs"
        description={c.kind_note}
        actions={
          <>
            {company.data?.is_demo && <Checkbox label="Include demo" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />}
            <label htmlFor="c-period" className="sr-only">Period</label>
            <Select id="c-period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-7 w-32 text-xs">
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </Select>
          </>
        }
      />
      <PageBody>
        {c.alerts.map((a) => (
          <div key={a.message} role="alert" className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${a.level === "critical" ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-warning"}`}>
            <AlertTriangle className="size-4" aria-hidden />{a.message}
          </div>
        ))}
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-line">
            <CostMetric label={`Total, last ${c.period_days} days`} amount={c.total} kind="estimated" />
            <CostMetric label="Per verified result" amount={c.cost_per_verified_result} kind="estimated" hint={`${c.verified_results} verified results`} />
            <CostMetric label="Live spend this month" amount={c.budget.spent_live_this_month} kind="estimated" />
            <div className="px-4 py-3">
              <div className="text-xs text-muted">Monthly budget</div>
              <div className="mt-1 text-xl font-semibold tabular">{c.budget.monthly === "0.00" || c.budget.monthly === "0" ? "Not set" : money(c.budget.monthly)}</div>
              <div className="mt-0.5 text-xs text-faint">Live runs stop when it is reached</div>
            </div>
          </div>
          <div className="border-t border-line"><AmountChart daily={c.daily} /></div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Breakdown title="By agent" rows={c.by_agent} />
          <Breakdown title="By model" rows={c.by_model} />
          <Breakdown title="By provider" rows={c.by_provider} />
          <Breakdown title="Most expensive tasks" rows={c.by_task} />
        </div>
      </PageBody>
    </>
  );
}
