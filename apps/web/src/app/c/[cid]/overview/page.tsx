"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AutonomyChart } from "@/components/charts";
import { ActivityTimeline, CostMetric } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, Progress, Select, Stat } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { money, percent } from "@/lib/format";
import { useCompany, useCompanyId, useOverview, usePersistentState } from "@/lib/queries";
import type { Company, Job } from "@/lib/types";

function DemoControls({ company }: { company: Company }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const toast = useToast();
  const client = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api<Job>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ["done", "failed", "cancelled"].includes(q.state.data.status) ? false : 700),
  });
  const running = !!jobId && (!job.data || ["queued", "running"].includes(job.data.status));

  useEffect(() => {
    if (running) void client.invalidateQueries({ queryKey: ["c", company.id] });
  }, [job.data?.progress?.done, running, client, company.id]);

  useEffect(() => {
    if (job.data?.status === "done") {
      toast.show({ tone: "success", title: "Demo week finished", description: "Open Approvals: the last day's results wait for you." });
      void client.invalidateQueries({ queryKey: ["c", company.id] });
    } else if (job.data?.status === "failed") {
      toast.show({ tone: "error", title: "The demo stopped", description: job.data.error ?? undefined });
    }
  }, [job.data?.status, job.data?.error, toast, client, company.id]);

  const start = async () => {
    try {
      const res = await api<{ job_id: string }>("/demo/run", { method: "POST" });
      setJobId(res.job_id);
    } catch (error) {
      toast.show({ tone: "error", title: errorMessage(error) });
    }
  };

  useEffect(() => {
    if (params.get("demo") === "run" && !jobId) {
      router.replace(`/c/${company.id}/overview`);
      window.setTimeout(() => void start(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- palette shortcut, run once
  }, [params]);

  const progress = job.data?.progress;
  return (
    <div className="flex items-center gap-2">
      {running && progress?.total ? (
        <div className="hidden w-48 sm:block">
          <div className="mb-1 flex justify-between text-2xs text-muted tabular">
            <span>Day {progress.day} of 7</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <Progress value={progress.done ?? 0} max={progress.total} label="Demo week progress" />
        </div>
      ) : null}
      <ConfirmDialog
        trigger={<Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" aria-hidden />} disabled={running}>Reset</Button>}
        title="Reset the demo company?"
        description="All demo tasks, receipts and licences are deleted and the agents start again as supervised."
        confirmLabel="Reset demo"
        onConfirm={async () => {
          await api("/demo/reset", { method: "POST" });
          await client.invalidateQueries({ queryKey: ["c", company.id] });
          toast.show({ tone: "success", title: "Demo reset" });
        }}
      />
      <Button size="sm" variant="primary" icon={<Play className="size-3.5" aria-hidden />} loading={running} onClick={start}>
        {running ? "Playing…" : "Run demo week"}
      </Button>
    </div>
  );
}

function OverviewInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [days, setDays] = usePersistentState<number>("overview.days", 7);
  const overview = useOverview(cid, days);

  if (overview.isPending || company.isPending) return <LoadingRows rows={8} />;
  if (overview.isError) return <ErrorState error={overview.error} retry={() => void overview.refetch()} />;
  if (company.isError) return <ErrorState error={company.error} />;
  const o = overview.data;
  const c = company.data;
  const a = o.autonomy;
  const simulated = o.is_demo ? <Badge tone="sampled">Simulated</Badge> : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description={o.is_demo ? "Recorded week in a fictional workshop. Every number below is computed by the real engine." : "What is happening, what needs you."}
        actions={
          <>
            <label htmlFor="period" className="sr-only">Period</label>
            <Select id="period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-7 w-32 text-xs">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </Select>
            {c.is_demo && <DemoControls company={c} />}
          </>
        }
      />
      <PageBody>
        {o.emergency_stop && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Emergency stop is on. No run or submission is accepted until it is lifted from the top bar.
          </div>
        )}
        <Card>
          <div className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x [&>*]:border-line max-md:[&>*:nth-child(n+3)]:border-t">
            <Stat label="Agents" value={`${o.agents.active}/${o.agents.total}`} hint={o.agents.paused ? `${o.agents.paused} paused` : "active / total"} />
            <Stat label="In progress" value={o.tasks.in_progress} hint={<Link className="hover:text-fg" href={`/c/${cid}/tasks`}>{o.tasks.todo} to do</Link>} />
            <Stat label="Blocked" value={o.tasks.blocked} tone={o.tasks.blocked ? "danger" : undefined} hint="need a human" />
            <Stat label="Approvals pending" value={<Link href={`/c/${cid}/approvals`} className="hover:underline">{o.approvals_pending}</Link>} tone={o.approvals_pending ? "warning" : undefined} hint="actions waiting" />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Autonomy, with its error rate"
              description="Share of finished tasks that needed no human, next to the errors humans found afterwards."
              actions={simulated}
            />
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
              <Stat label="Autonomy rate" value={percent(a.autonomy_rate)} tone="autonomous" hint={`${a.autonomous} of ${a.finished} finished`} />
              <Stat
                label="Undetected errors"
                value={a.undetected_error_measurable ? percent(a.undetected_error_rate, 1) : "Not yet measurable"}
                tone={a.undetected_errors ? "danger" : undefined}
                hint={a.undetected_error_measurable ? `${a.undetected_errors} in ${a.reviewed} reviewed` : `${a.reviewed} reviewed; 5 needed`}
              />
              <Stat label="Verified results" value={o.receipts.verified} hint={`${o.receipts.failed} failed checks`} />
              <Stat label="Autonomous licences" value={o.levels.autonomous} hint={`${o.levels.sampled} sampled · ${o.levels.supervised} supervised`} />
            </div>
            <AutonomyChart series={o.series} />
          </Card>

          <Card>
            <CardHeader title="Spend" description="Live runs only; demo costs are shown apart." actions={simulated} />
            <div className="divide-y divide-line">
              <CostMetric label={`Last ${o.period_days} days, live`} amount={o.costs.period_live} kind="estimated" />
              <CostMetric label="This month, live" amount={o.costs.month_live} kind="estimated"
                hint={o.costs.budget_remaining !== null ? `${money(o.costs.budget_remaining, c.currency)} left of ${money(o.costs.monthly_budget, c.currency)}` : "No monthly budget set"} />
              {o.is_demo && <CostMetric label="Demo (recorded, not billed)" amount={o.costs.period_demo} kind="estimated" />}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Recent activity" actions={<Link href={`/c/${cid}/activity`} className="text-xs text-accent hover:text-accent-strong">All activity</Link>} />
          {o.recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Nothing has happened yet. {c.is_demo ? "Press “Run demo week”." : <Link className="text-accent" href={`/c/${cid}/agents`}>Add your first agent</Link>}
            </p>
          ) : (
            <ActivityTimeline events={o.recent} dense />
          )}
        </Card>
      </PageBody>
    </>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <OverviewInner />
    </Suspense>
  );
}
