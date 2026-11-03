"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, ArrowDownRight, ArrowRight, ClipboardCheck, OctagonX, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { TaskWeek } from "@/components/charts";
import { ActivityTimeline, LEVELS, LEVEL_LABEL, LevelMeter } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { ConfirmDialog, Tooltip } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, DemoTag, Progress, Segmented, Skeleton, cx } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { money, percent, relative } from "@/lib/format";
import { useCompany, useCompanyId, useInbox, useOverview, usePersistentState } from "@/lib/queries";
import type { Company, InboxItem, Job, Level, Overview } from "@/lib/types";

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
    <div className="flex items-center gap-1.5">
      {running && progress?.total ? (
        <div className="hidden w-40 lg:block" aria-live="polite">
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

/** One cell of the status strip: a label, a tabular figure, one line of context. */
function StripCell({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning"; href?: string }) {
  const body = (
    <>
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("mt-0.5 text-lg leading-6 font-semibold tracking-[-0.015em] tabular", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg")}>{value}</div>
      {hint && <div className="truncate text-xs text-faint">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block min-w-0 px-4 py-3 transition-colors duration-[120ms] hover:bg-hover">{body}</Link>
  ) : (
    <div className="min-w-0 px-4 py-3">{body}</div>
  );
}

function LevelsBar({ levels }: { levels: Record<Level, number> }) {
  const total = LEVELS.reduce((n, l) => n + levels[l], 0);
  const color: Record<Level, string> = { supervised: "bg-supervised/70", sampled: "bg-sampled/80", autonomous: "bg-autonomous/85" };
  return (
    <div>
      <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={LEVELS.map((l) => `${levels[l]} ${LEVEL_LABEL[l].toLowerCase()}`).join(", ")}>
        {total === 0 ? (
          <span className="h-full w-full rounded-full bg-line-soft" />
        ) : (
          [...LEVELS].reverse().filter((l) => levels[l] > 0).map((l) => <span key={l} className={cx("h-full rounded-full", color[l])} style={{ flexGrow: levels[l] }} />)
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {[...LEVELS].reverse().map((l) => (
          <li key={l} className="inline-flex items-center gap-1.5">
            <LevelMeter level={l} />
            <span className="tabular text-fg">{levels[l]}</span> {LEVEL_LABEL[l].toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AutonomyHero({ o, cid }: { o: Overview; cid: string }) {
  const a = o.autonomy;
  const demo = o.is_demo || a.includes_demo;
  return (
    <Card aria-label="Autonomy">
      <div className="grid gap-6 border-b border-line-soft p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted">
            Autonomy, last {o.period_days} days
            {demo && <DemoTag />}
          </div>
          <div className="mt-2.5 flex flex-wrap items-end gap-x-4 gap-y-1">
            <span className="text-hero font-semibold text-fg tabular">{percent(a.autonomy_rate)}</span>
            <span className="pb-1">
              <span className="block text-[13px] text-muted">of finished work ran without a human</span>
              <span className="block text-xs text-faint">
                {a.finished ? `${a.autonomous} of ${a.finished} finished` : "No finished task yet"} · from the event log
              </span>
            </span>
          </div>
        </div>
        <Tooltip content="Share of the tasks reviewed by a human after the fact where the human found an error. Always shown next to the autonomy rate.">
          <div tabIndex={0} className="rounded-xl border border-line-soft bg-canvas/40 px-4 py-3 sm:min-w-52">
            <div className="text-xs text-muted">Errors found afterwards</div>
            <div className={cx("mt-1 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular", a.undetected_errors ? "text-danger" : "text-fg")}>
              {a.undetected_error_measurable ? percent(a.undetected_error_rate, 1) : "Not yet measurable"}
            </div>
            <div className="mt-0.5 text-xs text-faint">
              {a.undetected_error_measurable ? `${a.undetected_errors} in ${a.reviewed} reviewed` : `${a.reviewed} reviewed; 5 needed`}
            </div>
          </div>
        </Tooltip>
      </div>
      <TaskWeek series={o.series.slice(-7)} />
      <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <div className="mb-2 text-xs text-muted">Licences by level</div>
          <LevelsBar levels={o.levels} />
        </div>
        <Link href={`/c/${cid}/autonomy`} className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:text-accent-strong sm:self-end">
          Open Autonomy <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

const INBOX_ICON: Record<InboxItem["kind"], ReactNode> = {
  approval: <ClipboardCheck className="size-3.5 text-supervised" aria-hidden />,
  blocked: <AlertOctagon className="size-3.5 text-danger" aria-hidden />,
  demotion: <ArrowDownRight className="size-3.5 text-danger" aria-hidden />,
};

function NeedsYou({ cid }: { cid: string }) {
  const inbox = useInbox(cid);
  const items = inbox.data?.items ?? [];
  return (
    <Card aria-label="Needs you" className="flex flex-col">
      <CardHeader
        title="Needs you"
        description={items.length ? `${items.length} decision${items.length > 1 ? "s" : ""} only a human can make` : undefined}
        actions={items.length > 0 ? <Link href={`/c/${cid}/approvals`} className="text-xs font-medium text-accent hover:text-accent-strong">Review</Link> : null}
      />
      {inbox.isPending ? (
        <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState compact icon={<ClipboardCheck />} title="Nothing waits for you" description="Approvals, blocked tasks and demotions show up here." />
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.slice(0, 6).map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={item.kind === "approval" ? `/c/${cid}/approvals` : item.task_id ? `/c/${cid}/tasks/${item.task_id}` : item.agent_id ? `/c/${cid}/agents/${item.agent_id}` : `/c/${cid}/inbox`}
                className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-hover"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2">{INBOX_ICON[item.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{item.title}</span>
                  <span className="block truncate text-xs text-faint">{item.detail} · {relative(item.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && (
        <Link href={`/c/${cid}/inbox`} className="mt-auto block border-t border-line-soft px-4 py-2 text-xs text-muted hover:text-fg">
          {items.length - 6} more in Inbox
        </Link>
      )}
    </Card>
  );
}

function Spend({ o, company }: { o: Overview; company: Company }) {
  const budget = Number(o.costs.monthly_budget);
  const spent = Number(o.costs.month_live);
  return (
    <Card aria-label="Spend">
      <CardHeader title="Spend" description="Live runs, estimated from token counts" actions={<Link href={`/c/${company.id}/costs`} className="text-xs font-medium text-accent hover:text-accent-strong">Costs</Link>} />
      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted">This month</span>
            <span className="text-xs text-faint tabular">{budget > 0 ? `budget ${money(o.costs.monthly_budget, company.currency)}` : "no budget set"}</span>
          </div>
          <div className="mt-1 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular">{money(o.costs.month_live, company.currency, 2)}</div>
          {budget > 0 && <Progress className="mt-2" value={spent} max={budget} tone={spent / budget > 0.9 ? "danger" : spent / budget > 0.7 ? "supervised" : "accent"} label="Monthly budget used" />}
          {o.costs.budget_remaining !== null && <p className="mt-1.5 text-xs text-faint">{money(o.costs.budget_remaining, company.currency)} left · runs stop at the budget</p>}
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-line-soft pt-3 text-xs">
          <div>
            <dt className="text-muted">Last {o.period_days} days</dt>
            <dd className="mt-0.5 text-[13px] text-fg tabular">{money(o.costs.period_live, company.currency, 4)}</dd>
          </div>
          {o.is_demo && (
            <div>
              <dt className="flex items-center gap-1.5 text-muted">Recorded <DemoTag /></dt>
              <dd className="mt-0.5 text-[13px] text-fg tabular">{money(o.costs.period_demo, company.currency, 4)}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}

function OverviewInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [days, setDays] = usePersistentState<number>("overview.days", 7);
  const overview = useOverview(cid, days);

  const header = (c?: Company) => (
    <PageHeader
      title="Overview"
      description="What runs on its own, what needs you"
      actions={
        <>
          <Segmented
            label="Period"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]}
          />
          {c?.is_demo && <DemoControls company={c} />}
        </>
      }
    />
  );

  if (overview.isPending || company.isPending) {
    return (
      <>
        {header(company.data)}
        <PageBody>
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-96 rounded-xl lg:col-span-2" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </PageBody>
      </>
    );
  }
  if (overview.isError) return <ErrorState error={overview.error} retry={() => void overview.refetch()} />;
  if (company.isError) return <ErrorState error={company.error} />;
  const o = overview.data;
  const c = company.data;

  return (
    <>
      {header(c)}
      <PageBody>
        {o.emergency_stop && (
          <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-danger/35 bg-danger/8 px-4 py-3 text-[13px] text-danger">
            <OctagonX className="size-4 shrink-0" aria-hidden />
            Emergency stop is on. No run or submission is accepted until it is lifted from the top bar.
          </div>
        )}

        <Card aria-label="Company status">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-line-soft max-sm:[&>*:nth-child(odd)]:border-r sm:max-xl:[&>*:not(:nth-child(3n))]:border-r xl:[&>*:not(:last-child)]:border-r max-sm:[&>*:nth-child(n+3)]:border-t sm:max-xl:[&>*:nth-child(n+4)]:border-t">
            <StripCell label="Agents active" value={`${o.agents.active}/${o.agents.total}`} hint={o.agents.paused ? `${o.agents.paused} paused` : "all on duty"} href={`/c/${cid}/agents`} />
            <StripCell label="In progress" value={o.tasks.in_progress} hint={`${o.tasks.todo} to do`} href={`/c/${cid}/tasks`} />
            <StripCell label="Approvals pending" value={o.approvals_pending} tone={o.approvals_pending ? "warning" : undefined} hint="actions waiting" href={`/c/${cid}/approvals`} />
            <StripCell label="Blocked" value={o.tasks.blocked} tone={o.tasks.blocked ? "danger" : undefined} hint="need a human" href={`/c/${cid}/tasks`} />
            <StripCell label="Verified results" value={o.receipts.verified} hint={`${o.receipts.failed} failed · ${o.receipts.blocked} missing info`} href={`/c/${cid}/verification`} />
            <StripCell label="Spend this month" value={money(o.costs.month_live, c.currency, 2)} hint={Number(o.costs.monthly_budget) > 0 ? `of ${money(o.costs.monthly_budget, c.currency, 0)}` : "no budget"} href={`/c/${cid}/costs`} />
          </div>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <AutonomyHero o={o} cid={cid} />
            <RecentActivity o={o} company={c} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <NeedsYou cid={cid} />
            <Spend o={o} company={c} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

function RecentActivity({ o, company: c }: { o: Overview; company: Company }) {
  const cid = c.id;
  return (
        <Card aria-label="Recent activity">
          <CardHeader
            title="Recent activity"
            actions={
              <>
                {o.is_demo && <Badge>Replayed demo events included</Badge>}
                <Link href={`/c/${cid}/activity`} className="text-xs font-medium text-accent hover:text-accent-strong">All activity</Link>
              </>
            }
          />
          {o.recent.length === 0 ? (
            <EmptyState
              compact
              title="Nothing has happened yet"
              description={c.is_demo ? "Press “Run demo week” to replay a week in the workshop." : "Add an agent, give it a task, and every step will be recorded here."}
              action={!c.is_demo ? <Link href={`/c/${cid}/agents?new=1`} className="text-[13px] font-medium text-accent hover:text-accent-strong">Add your first agent</Link> : undefined}
            />
          ) : (
            <ActivityTimeline events={o.recent.slice(0, 8)} dense />
          )}
        </Card>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <OverviewInner />
    </Suspense>
  );
}
