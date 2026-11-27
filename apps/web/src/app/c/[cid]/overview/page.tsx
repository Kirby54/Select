"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, ArrowDownRight, ArrowRight, Bot, CircleDollarSign, CircleDot, ClipboardCheck, Mail, OctagonX, Play, Plus, RotateCcw, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { ActivityTimeline } from "@/components/domain";
import { SceneHistogram, SceneLegend } from "@/components/pyramid-scene";
import { taskBands, useSelectedBand } from "@/components/scene-backdrop";
import { PageBody, PageHeader, useNewTask } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Button, DemoTag, Progress, Skeleton, cx } from "@/components/ui/primitives";
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
    <Link href={href} className="glass glass-hover group block min-w-0 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cx("text-2xl leading-tight font-bold tracking-tight tabular", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-white")}>{value}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-white/80">{label}</p>
          {detail && <p className="mt-0.5 truncate text-[11px] text-white/60">{detail}</p>}
        </div>
        <span className="mt-1 shrink-0 text-white/55 [&_svg]:size-4" aria-hidden>{icon}</span>
      </div>
    </Link>
  );
}

/** A section heading in capitals above its list. */
function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
      <h2 className="text-[10px] font-medium tracking-[0.12em] text-white/65 uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** The signature indicator: prominently show autonomy AND the errors found afterwards. */
function AutonomyLine({ o, cid }: { o: Overview; cid: string }) {
  const a = o.autonomy;
  return (
    <Link
      href={`/c/${cid}/autonomy`}
      className="glass glass-hover group block px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
          <ShieldCheck className="size-4 text-autonomous" aria-hidden />
          Verified autonomy
          <span className="font-normal text-faint">· Last {o.period_days} days</span>
          {(o.is_demo || a.includes_demo) && <DemoTag />}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          Explore evidence <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 sm:gap-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <strong className="text-2xl font-bold leading-none tracking-tight text-white tabular">{percent(a.autonomy_rate)}</strong>
            <span className="text-xs text-muted">finished without a person</span>
          </p>
          <p className="mt-1.5 text-xs text-faint">
            {a.finished ? `${a.autonomous} of ${a.finished} finished tasks` : "No finished tasks yet"}
          </p>
        </div>
        <div className="min-w-0 border-t border-white/10 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <strong className={cx("text-2xl font-bold leading-none tracking-tight tabular", a.undetected_errors ? "text-danger" : "text-white")}>
              {a.undetected_error_measurable ? percent(a.undetected_error_rate, 1) : "—"}
            </strong>
            <span className="text-xs text-muted">errors found afterwards</span>
          </p>
          <p className="mt-1.5 text-xs text-faint">
            {a.undetected_error_measurable
              ? `${a.undetected_errors} in ${a.reviewed} independently reviewed tasks`
              : `Measurable after 5 reviews · ${a.reviewed} so far`}
          </p>
        </div>
      </div>
    </Link>
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
    <section aria-label="Needs you" className="glass flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Heading action={items.length > 6 ? <Link href={`/c/${cid}/inbox`} className="text-xs font-medium text-accent hover:text-accent-strong">All {items.length}</Link> : null}>Needs you</Heading>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto pb-1">
        {inbox.isPending ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState compact icon={<ClipboardCheck />} title="Nothing waits for you" />
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {items.slice(0, 6).map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={inboxHref(cid, item)} className="flex items-start gap-3 px-4 py-2 transition-colors duration-[120ms] hover:bg-white/5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.07]">{INBOX_ICON[item.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{item.title}</span>
                    <span className="block truncate text-xs text-white/60">{item.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs text-white/55">{relative(item.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function RecentActivity({ o, company: c }: { o: Overview; company: Company }) {
  const cid = c.id;
  return (
    <section aria-label="Recent activity" className="glass flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Heading action={<Link href={`/c/${cid}/activity`} className="text-xs font-medium text-accent hover:text-accent-strong">All activity</Link>}>Recent activity</Heading>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto pb-1">
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
      </div>
    </section>
  );
}

function OverviewInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const overview = useOverview(cid, 30);
  const inbox = useInbox(cid);
  const agents = useAgents(cid);

  const newTask = useNewTask();
  const { selected, setSelected } = useSelectedBand();
  const header = (c?: Company) => <PageHeader title="Home" actions={c?.is_demo ? <DemoControls company={c} /> : undefined} />;

  if (overview.isPending || company.isPending) {
    return (
      <>
        {header(company.data)}
        <PageBody>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <Skeleton className="h-12 rounded-xl" />
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

  const bands = taskBands(o, cid);
  const series = o.series.slice(-30);
  const dayLabel = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const histogramLabel = series.length ? `Finished · ${dayLabel(series[0]?.day)} → ${dayLabel(series[series.length - 1]?.day)}` : "";

  return (
    <>
      {header(c)}
      {/* One screen on laptops and desktops: the figures float in glass over the pyramids, nothing scrolls.
          On phones the same panels stack and scroll over the scene. */}
      <section
        aria-label="Home"
        className={cx(
          "pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 lg:grid lg:flex-none lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-4 lg:overflow-hidden",
          // exactly the screen under the top bar (and the demo note): nothing to scroll
          c.is_demo ? "lg:h-[calc(100dvh-75px-var(--titlebar))]" : "lg:h-[calc(100dvh-44px-var(--titlebar))]",
        )}
      >
        <div className="pointer-events-auto grid grid-cols-2 gap-3 lg:col-start-1 lg:row-start-1 xl:grid-cols-4">
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

        {o.emergency_stop && (
          <div role="alert" className="glass pointer-events-auto flex items-center gap-2.5 self-start px-4 py-2.5 text-sm text-danger lg:col-start-1 lg:row-start-2">
            <OctagonX className="size-4 shrink-0" aria-hidden />
            Emergency stop is on: no agent runs until it is lifted from the top bar.
          </div>
        )}

        {/* Room for the pyramids on phones */}
        <div className="h-[34dvh] shrink-0 lg:hidden" aria-hidden />

        <div className="pointer-events-auto flex min-h-0 flex-col gap-3 max-lg:min-h-[640px] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-4">
          {c.role !== "viewer" && (
            <button
              type="button"
              onClick={() => newTask()}
              className="glass glass-hover flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full! px-4 text-sm font-medium text-white"
            >
              <Plus className="size-4" aria-hidden />
              New task
            </button>
          )}
          <NeedsYou cid={cid} />
          <RecentActivity o={o} company={c} />
        </div>

        <div className="pointer-events-auto flex flex-col gap-3 lg:col-start-1 lg:row-start-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="glass w-full px-3 py-2.5 lg:w-[230px] lg:shrink-0">
            <SceneLegend bands={bands} selected={selected} onSelect={setSelected} />
          </div>
          <div className="min-w-0 flex-1 lg:max-w-[460px]">
            <AutonomyLine o={o} cid={cid} />
          </div>
          {series.length > 0 && (
            <div className="glass w-full px-3 py-2.5 lg:ml-auto lg:w-[190px] lg:shrink-0">
              <SceneHistogram values={series.map((d) => d.finished)} label={histogramLabel} />
            </div>
          )}
        </div>
      </section>
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
