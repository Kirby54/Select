"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, ArrowDownRight, ArrowRight, Bot, CircleDollarSign, CircleDot, ClipboardCheck, Mail, OctagonX, Play, RotateCcw, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { DailyBars, GlanceCard, PartsBar, type Part } from "@/components/charts";
import { ActivityTimeline } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Button, Card, DemoTag, Progress, Skeleton, cx } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { inboxHref, money, percent, relative } from "@/lib/format";
import { useAgents, useCompany, useCompanyId, useInbox, useOverview } from "@/lib/queries";
import type { Company, InboxItem, Job, Overview } from "@/lib/types";

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

/** One figure, the way an operator scans it: the number first, its name, one line of context. */
function Metric({ href, value, label, detail, icon, tone }: { href: string; value: ReactNode; label: string; detail?: ReactNode; icon: ReactNode; tone?: "warning" | "danger" }) {
  return (
    <Link href={href} className="group block rounded-xl border border-line bg-surface p-4 transition-colors duration-[120ms] hover:border-line-strong sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cx("text-2xl font-bold tracking-tight tabular sm:text-3xl", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg")}>{value}</p>
          <p className="mt-1 text-xs font-semibold text-muted sm:text-sm">{label}</p>
          {detail && <p className="mt-1.5 hidden truncate text-xs text-faint sm:block">{detail}</p>}
        </div>
        <span className="mt-1.5 shrink-0 text-faint [&_svg]:size-4" aria-hidden>{icon}</span>
      </div>
    </Link>
  );
}

/** A section heading in capitals above its list. */
function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** The honest counter in one line: work finished without a person, next to the errors found afterwards. */
function AutonomyLine({ o, cid }: { o: Overview; cid: string }) {
  const a = o.autonomy;
  return (
    <Link href={`/c/${cid}/autonomy`} className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-compact transition-colors duration-[120ms] hover:border-line-strong">
      <span className="inline-flex items-center gap-2 text-muted">
        <ShieldCheck className="size-4 text-faint" aria-hidden />
        Last {o.period_days} days
        {(o.is_demo || a.includes_demo) && <DemoTag />}
      </span>
      <span>
        <span className="font-semibold text-fg tabular">{percent(a.autonomy_rate)}</span>{" "}
        <span className="text-muted">{a.finished ? `finished without a person (${a.autonomous} of ${a.finished} finished)` : "finished without a person · no finished task yet"}</span>
      </span>
      <span>
        <span className={cx("font-semibold tabular", a.undetected_errors ? "text-danger" : "text-fg")}>{a.undetected_error_measurable ? percent(a.undetected_error_rate, 1) : "—"}</span>{" "}
        <span className="text-muted">{a.undetected_error_measurable ? `errors found afterwards (${a.undetected_errors} in ${a.reviewed} reviewed)` : `errors found afterwards · measurable after 5 reviews (${a.reviewed} so far)`}</span>
      </span>
      <ArrowRight className="ml-auto size-4 text-faint" aria-hidden />
    </Link>
  );
}

/** Four small charts from the overview's own counts: the work, its checks, the licences and the last 14 days. */
function AtAGlance({ o, cid }: { o: Overview; cid: string }) {
  const t = o.tasks;
  const work: Part[] = [
    { key: "done", label: "Done", value: t.done, color: "bg-success" },
    { key: "in_progress", label: "In progress", value: t.in_progress, color: "bg-accent" },
    { key: "awaiting", label: "Waiting for you", value: t.awaiting_approval, color: "bg-supervised" },
    { key: "blocked", label: "Blocked", value: t.blocked, color: "bg-danger" },
    { key: "todo", label: "To do", value: t.todo, color: "bg-ghost" },
  ];
  const tasks = work.reduce((n, p) => n + p.value, 0);
  const r = o.receipts;
  const checked = r.verified + r.failed + r.blocked;
  const checks: Part[] = [
    { key: "verified", label: "Passed", value: r.verified, color: "bg-success" },
    { key: "failed", label: "Failed", value: r.failed, color: "bg-danger" },
    { key: "blocked", label: "Missing info", value: r.blocked, color: "bg-warning" },
  ];
  const l = o.levels;
  const licences: Part[] = [
    { key: "autonomous", label: "Autonomous", value: l.autonomous, color: "bg-autonomous" },
    { key: "sampled", label: "Sampled", value: l.sampled, color: "bg-sampled" },
    { key: "supervised", label: "Supervised", value: l.supervised, color: "bg-supervised" },
  ];
  const days = o.series.slice(-14);
  const finished = days.reduce((n, d) => n + d.finished, 0);
  return (
    <section aria-label="At a glance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <GlanceCard title="Work" figure={tasks} unit={tasks === 1 ? "task" : "tasks"} href={`/c/${cid}/tasks`}>
        <PartsBar parts={work} label="Tasks by status" />
      </GlanceCard>
      <GlanceCard title="Checks" figure={checked ? percent(r.verified / checked) : "—"} unit={`passed · ${r.verified} of ${checked} results`} href={`/c/${cid}/verification`}>
        <PartsBar parts={checks} label={`Verification results, last ${o.period_days} days`} />
      </GlanceCard>
      <GlanceCard title="Licences" figure={l.autonomous + l.sampled + l.supervised} unit="per agent and task type" href={`/c/${cid}/autonomy`}>
        <PartsBar parts={licences} label="Licences by level" />
      </GlanceCard>
      <GlanceCard title="Finished" figure={finished} unit="in the last 14 days" href={`/c/${cid}/autonomy`}>
        <DailyBars series={days} />
      </GlanceCard>
    </section>
  );
}

const INBOX_ICON: Record<InboxItem["kind"], ReactNode> = {
  approval: <ClipboardCheck className="size-3.5 text-supervised" aria-hidden />,
  blocked: <AlertOctagon className="size-3.5 text-danger" aria-hidden />,
  demotion: <ArrowDownRight className="size-3.5 text-danger" aria-hidden />,
  message: <Mail className="size-3.5 text-accent" aria-hidden />,
  delivery: <Send className="size-3.5 text-warning" aria-hidden />,
};

function NeedsYou({ cid }: { cid: string }) {
  const inbox = useInbox(cid);
  const items = inbox.data?.items ?? [];
  return (
    <section aria-label="Needs you" className="min-w-0">
      <Heading action={items.length > 6 ? <Link href={`/c/${cid}/inbox`} className="text-xs font-medium text-accent hover:text-accent-strong">All {items.length}</Link> : null}>Needs you</Heading>
      <Card>
        {inbox.isPending ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState compact icon={<ClipboardCheck />} title="Nothing waits for you" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.slice(0, 6).map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={inboxHref(cid, item)} className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-hover">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2">{INBOX_ICON[item.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{item.title}</span>
                    <span className="block truncate text-xs text-faint">{item.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs text-faint">{relative(item.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function RecentActivity({ o, company: c }: { o: Overview; company: Company }) {
  const cid = c.id;
  return (
    <section aria-label="Recent activity" className="min-w-0">
      <Heading action={<Link href={`/c/${cid}/activity`} className="text-xs font-medium text-accent hover:text-accent-strong">All activity</Link>}>Recent activity</Heading>
      <Card>
        {o.recent.length === 0 ? (
          <EmptyState
            compact
            title="Nothing has happened yet"
            description={c.is_demo ? "Press “Run demo week” to replay a week in the workshop." : undefined}
            action={!c.is_demo ? <Link href={`/c/${cid}/agents?new=1`} className="text-sm font-medium text-accent hover:text-accent-strong">Add your first agent</Link> : undefined}
          />
        ) : (
          <ActivityTimeline events={o.recent.slice(0, 8)} dense />
        )}
      </Card>
    </section>
  );
}

function OverviewInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const overview = useOverview(cid, 30);
  const inbox = useInbox(cid);
  const agents = useAgents(cid);

  const header = (c?: Company) => <PageHeader title="Home" actions={c?.is_demo ? <DemoControls company={c} /> : undefined} />;

  if (overview.isPending || company.isPending) {
    return (
      <>
        {header(company.data)}
        <PageBody>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <Skeleton className="h-12 rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </PageBody>
      </>
    );
  }
  if (overview.isError) return <ErrorState error={overview.error} retry={() => void overview.refetch()} />;
  if (company.isError) return <ErrorState error={company.error} />;
  const o = overview.data;
  const c = company.data;
  const working = (agents.data ?? []).filter((a) => a.working > 0).length;
  const waiting = inbox.data?.items.length ?? o.approvals_pending;
  const budget = Number(o.costs.monthly_budget);
  const waitingDetail = [
    `${o.approvals_pending} approval${o.approvals_pending === 1 ? "" : "s"}`,
    o.mail.needs_attention ? `${o.mail.needs_attention} e-mail${o.mail.needs_attention === 1 ? "" : "s"}` : null,
    o.tasks.blocked ? `${o.tasks.blocked} blocked` : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      {header(c)}
      <PageBody className="space-y-6">
        {o.emergency_stop && (
          <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-danger/35 bg-danger/8 px-4 py-3 text-sm text-danger">
            <OctagonX className="size-4 shrink-0" aria-hidden />
            Emergency stop is on: no agent runs until it is lifted from the top bar.
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric href={`/c/${cid}/agents`} value={o.agents.active} label={o.agents.active === 1 ? "Agent active" : "Agents active"} detail={`${working} working now · ${o.agents.paused} paused`} icon={<Bot />} />
            <Metric href={`/c/${cid}/tasks`} value={o.tasks.in_progress} label="Tasks in progress" detail={`${o.tasks.todo} to do · ${o.tasks.blocked} blocked`} icon={<CircleDot />} />
            <Metric href={`/c/${cid}/approvals`} value={waiting} label="Waiting for you" detail={waitingDetail} icon={<ClipboardCheck />} tone={waiting ? "warning" : undefined} />
            <Metric
              href={`/c/${cid}/costs`}
              value={money(o.costs.month_live, "USD", 2)}
              label="AI spend this month"
              detail={budget > 0 ? `of ${money(o.costs.monthly_budget, "USD", 0)} budget · estimated` : "No budget limit · estimated"}
              icon={<CircleDollarSign />}
              tone={budget > 0 && Number(o.costs.month_live) / budget > 0.9 ? "danger" : undefined}
            />
          </div>
          <AutonomyLine o={o} cid={cid} />
        </div>

        <AtAGlance o={o} cid={cid} />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <NeedsYou cid={cid} />
          <RecentActivity o={o} company={c} />
        </div>
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
