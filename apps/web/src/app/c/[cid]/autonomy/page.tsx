"use client";

import { ArrowDownRight, ArrowUpRight, Lock, LockOpen, Scale, ShieldCheck, Unlock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentAvatar, AutonomyLevel, LEVELS, LEVEL_HELP, LEVEL_LABEL, LevelMeter, LicenceLadder, LicenceNextStep } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Button, Card, CardHeader, DemoTag, Field, Segmented, Skeleton, Textarea, cx } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { percent, relative, taskTypeLabel } from "@/lib/format";
import { useIsDesktop } from "@/lib/hooks";
import { useAction, useAutonomy, useCompany, useCompanyId, usePersistentState } from "@/lib/queries";
import type { AutonomyView, Level, Licence, TrustEvent } from "@/lib/types";

function RevokeButton({ cid, licence }: { cid: string; licence: Licence }) {
  const [note, setNote] = useState("");
  const revoke = useAction(cid, () => api(`/companies/${cid}/autonomy/${licence.id}/revoke`, { method: "POST", body: { note } }), {
    success: `${licence.agent_name} is supervised again on ${taskTypeLabel(licence.task_type)}`,
  });
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" icon={<Lock className="size-3.5" aria-hidden />}>Revoke</Button>}
      title={`Revoke ${licence.agent_name}'s licence?`}
      description={`Immediate: the next ${taskTypeLabel(licence.task_type).toLowerCase()} result goes to a human, and no promotion happens until someone clears the freeze.`}
      confirmLabel="Revoke now"
      onConfirm={() => revoke.mutateAsync(undefined)}
    >
      <Field label="Reason (recorded in the audit log)" htmlFor={`revoke-${licence.id}`}>
        <Textarea id={`revoke-${licence.id}`} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
      </Field>
    </ConfirmDialog>
  );
}

const Ladder = LicenceLadder;
const NextStep = LicenceNextStep;

function CounterCard({ v, days }: { v: AutonomyView; days: number }) {
  const c = v.counter;
  return (
    <Card className="lg:col-span-2" aria-label="Autonomy counter">
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted">
            Finished without a human, last {days} days {c.includes_demo && <DemoTag />}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-hero font-semibold tabular">{percent(c.autonomy_rate)}</span>
            <span className="text-[13px] text-muted">{c.finished ? `${c.autonomous} of ${c.finished} tasks` : "no finished task yet"}</span>
          </div>
        </div>
        <div className="rounded-xl border border-line-soft bg-canvas/40 px-4 py-3 sm:min-w-56">
          <div className="text-xs text-muted">Errors found afterwards</div>
          <div className={cx("mt-1 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular", c.undetected_errors ? "text-danger" : "text-fg")}>
            {c.undetected_error_measurable ? percent(c.undetected_error_rate, 1) : "Not yet measurable"}
          </div>
          <div className="mt-0.5 text-xs text-faint">{c.undetected_errors} in {c.reviewed} human-reviewed{!c.undetected_error_measurable && "; 5 needed"}</div>
        </div>
      </div>
      {c.finished > 0 && (
        <div className="px-5 pb-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={`${c.autonomous} of ${c.finished} finished without a human`}>
            <span className="h-full bg-autonomous/85 transition-[width] duration-700 ease-out" style={{ width: `${(c.autonomous / c.finished) * 100}%` }} />
          </div>
          <p className="mt-2.5 text-xs text-faint">
            The two rates are always shown together: autonomy that lets errors through is not autonomy.
          </p>
        </div>
      )}
      <ByAgent v={v} />
    </Card>
  );
}

/** Which posts already run without the manager, agent by agent. */
function ByAgent({ v }: { v: AutonomyView }) {
  const names = new Map(v.licences.map((l) => [l.agent_id, l.agent_name ?? "Unknown agent"]));
  const rows = Object.entries(v.counter.by_agent)
    .map(([id, r]) => ({ id, name: names.get(id) ?? "Unassigned", ...r }))
    .sort((a, b) => b.finished - a.finished);
  if (rows.length === 0) return null;
  return (
    <div className="border-t border-line-soft px-5 py-4">
      <div className="mb-2.5 text-xs text-muted">By agent</div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2"><AgentAvatar name={r.name} size="sm" /><span className="truncate text-fg">{r.name}</span></span>
            <span className="flex h-1.5 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={`${r.autonomous} of ${r.finished} without a human`}>
              <span className="h-full bg-autonomous/85" style={{ width: `${r.finished ? (r.autonomous / r.finished) * 100 : 0}%` }} />
            </span>
            <span className="w-24 text-right text-xs text-muted tabular">{r.autonomous} of {r.finished}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LevelsCard({ v, cid }: { v: AutonomyView; cid: string }) {
  const byLevel = useMemo(() => {
    const groups: Record<Level, Licence[]> = { supervised: [], sampled: [], autonomous: [] };
    for (const l of v.licences) groups[l.level].push(l);
    return groups;
  }, [v.licences]);
  return (
    <Card aria-label="Licences by level">
      <CardHeader title="Where the team stands" description="One licence per agent and task type" />
      <ul className="divide-y divide-line-soft">
        {[...LEVELS].reverse().map((level) => (
          <li key={level} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <LevelMeter level={level} />
              <span className="text-[13px] font-medium text-fg">{LEVEL_LABEL[level]}</span>
              <span className="ml-auto text-[13px] text-fg tabular">{v.levels[level]}</span>
            </div>
            <p className="mt-0.5 text-xs text-faint">{LEVEL_HELP[level]}</p>
            {byLevel[level].length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {byLevel[level].map((l) => (
                  <li key={l.id}>
                    <Link href={`/c/${cid}/agents/${l.agent_id}`} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-surface-2 pr-2 pl-0.5 text-xs text-muted transition-colors hover:text-fg">
                      <AgentAvatar name={l.agent_name ?? "?"} size="sm" />
                      {l.agent_name} · {taskTypeLabel(l.task_type)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const KIND: Record<TrustEvent["kind"], { icon: typeof ArrowUpRight; tone: string; label: string }> = {
  promote: { icon: ArrowUpRight, tone: "text-autonomous bg-autonomous/12", label: "Promoted" },
  demote: { icon: ArrowDownRight, tone: "text-danger bg-danger/12", label: "Demoted" },
  revoke: { icon: Lock, tone: "text-danger bg-danger/12", label: "Revoked" },
  unfreeze: { icon: LockOpen, tone: "text-accent bg-accent/12", label: "Unfrozen" },
  reset: { icon: ArrowDownRight, tone: "text-faint bg-surface-2", label: "Reset" },
};

function Changes({ events }: { events: TrustEvent[] }) {
  const [filter, setFilter] = useState<"all" | "up" | "down">("all");
  const shown = events.filter((e) => filter === "all" || (filter === "up" ? e.kind === "promote" : e.kind === "demote" || e.kind === "revoke"));
  return (
    <Card className="lg:col-span-2" aria-label="Why each level changed">
      <CardHeader
        title="Why each level changed"
        description="Every promotion, demotion and revocation, with what caused it"
        actions={<Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "up", label: "Promotions" }, { value: "down", label: "Demotions" }]} />}
      />
      {shown.length === 0 ? (
        <EmptyState compact title="No change yet" description="Levels change after verified streaks, failed checks, human corrections or revocations." />
      ) : (
        <ol className="divide-y divide-line-soft">
          {shown.map((e) => {
            const k = KIND[e.kind];
            return (
              <li key={e.id} className="flex gap-3 px-4 py-3">
                <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", k.tone)} aria-hidden><k.icon className="size-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-[13px] font-medium text-fg">{e.agent_name}</span>
                    <span className="text-muted">{taskTypeLabel(e.task_type)}</span>
                    <span className="inline-flex items-center gap-1">
                      <AutonomyLevel level={e.from_level} compact />
                      <span className="text-faint" aria-label="to">→</span>
                      <AutonomyLevel level={e.to_level} compact />
                    </span>
                    {e.is_demo && <DemoTag />}
                    <span className="ml-auto text-faint">{e.actor} · {relative(e.created_at)}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted"><span className="sr-only">{k.label}: </span>{e.reason}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function Rules({ v }: { v: AutonomyView }) {
  const p = v.policy;
  const risks = Object.entries(p.max_level_by_risk ?? {});
  return (
    <Card aria-label="Rules and limits">
      <CardHeader title="Rules and limits" description="Applied by the server; an agent cannot change them" />
      <dl className="divide-y divide-line-soft text-[13px]">
        <div className="px-4 py-3">
          <dt className="text-xs text-muted">Promotion</dt>
          <dd className="mt-1 text-fg">
            <span className="tabular">{p.promote_after.supervised}</span> verified successes in a row to reach sampled, <span className="tabular">{p.promote_after.sampled}</span> more to reach autonomous.
            <span className="mt-0.5 block text-xs text-faint">Starting hypotheses, to calibrate. Adjustable in Settings.</span>
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-muted">Sampled review</dt>
          <dd className="mt-1 text-fg"><span className="tabular">{Math.round(p.sample_rate * 100)} %</span> of a sampled agent&apos;s results go to a human, picked deterministically.</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-muted">Back to supervised at once on</dt>
          <dd className="mt-1 text-fg">a failed blocking check, a human correction or rejection, or a reported problem.</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-muted">Highest level by risk class</dt>
          <dd className="mt-1.5 space-y-1.5">
            {risks.map(([risk, level]) => (
              <div key={risk} className="flex items-center justify-between gap-3">
                <span className="text-muted capitalize">{risk}</span>
                <AutonomyLevel level={level} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted"><Scale className="size-3.5" aria-hidden />Legal</span>
              <span className="inline-flex items-center gap-1.5"><AutonomyLevel level={v.legal_cap} /><Lock className="size-3 text-faint" aria-label="hard-coded" /></span>
            </div>
            <p className="pt-1 text-xs text-faint">Payments, signatures, hiring, firing and tax filings stay human, in code. A high score never bypasses this.</p>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export default function AutonomyPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [days, setDays] = usePersistentState<number>("autonomy.days", 7);
  const autonomy = useAutonomy(cid, days);
  const unfreeze = useAction(cid, (id: string) => api(`/companies/${cid}/autonomy/${id}/unfreeze`, { method: "POST" }), { success: "Licence unfrozen" });
  const role = company.data?.role ?? "viewer";
  const canAct = role !== "viewer";
  const canAdmin = role === "owner" || role === "admin";
  // One layout mounted at a time (table on wider screens, stacked rows on phones).
  const desktop = useIsDesktop();

  const header = (
    <PageHeader
      title="Autonomy"
      description="Each agent earns the right to act alone, one task type at a time"
      actions={<Segmented label="Period" value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />}
    />
  );

  if (autonomy.isPending) {
    return (
      <>
        {header}
        <PageBody>
          <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-48 rounded-xl lg:col-span-2" /><Skeleton className="h-48 rounded-xl" /></div>
          <Skeleton className="h-72 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (autonomy.isError) return <>{header}<ErrorState error={autonomy.error} retry={() => void autonomy.refetch()} /></>;
  const v = autonomy.data;

  return (
    <>
      {header}
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          <CounterCard v={v} days={days} />
          <LevelsCard v={v} cid={cid} />
        </div>

        <Card aria-label="Licences">
          <CardHeader title="Licences" description="Each row is one agent on one task type: where it stands and what it needs for the next level" />
          {v.licences.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="No licence yet" description="A licence appears when an agent produces its first verified result for a task type." />
          ) : desktop ? (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <caption className="sr-only">Autonomy licences</caption>
                  <thead>
                    <tr className="text-left text-xs text-faint">
                      {["Agent", "Task type", "Level", "Ladder", "Next step", "Record", ""].map((h, i) => (
                        <th key={i} scope="col" className="h-8 border-b border-line-soft px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="[&>tr>td]:border-b [&>tr>td]:border-line-soft [&>tr:last-child>td]:border-0">
                    {v.licences.map((l) => (
                      <tr key={l.id} className="transition-colors duration-[120ms] hover:bg-hover">
                        <td className="h-12 px-3 pl-4 whitespace-nowrap">
                          <Link className="inline-flex items-center gap-2 text-fg hover:underline" href={`/c/${cid}/agents/${l.agent_id}`}>
                            <AgentAvatar name={l.agent_name ?? "?"} size="sm" />
                            {l.agent_name}
                          </Link>
                        </td>
                        <td className="px-3 whitespace-nowrap text-muted">{taskTypeLabel(l.task_type)}{l.risk && <span className="ml-1.5 text-xs text-faint">· {l.risk} risk</span>}</td>
                        <td className="px-3"><AutonomyLevel level={l.level} frozen={l.frozen} /></td>
                        <td className="w-[28%] px-3"><Ladder licence={l} /></td>
                        <td className="px-3 whitespace-nowrap"><NextStep licence={l} /></td>
                        <td className="px-3 text-xs whitespace-nowrap text-muted tabular">{l.successes} ok · {l.failures} failed</td>
                        <td className="px-3 pr-4 text-right whitespace-nowrap">
                          {canAct && l.level !== "supervised" && !l.frozen && <RevokeButton cid={cid} licence={l} />}
                          {canAdmin && l.frozen && <Button size="sm" variant="ghost" icon={<Unlock className="size-3.5" aria-hidden />} loading={unfreeze.isPending} onClick={() => unfreeze.mutate(l.id)}>Unfreeze</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          ) : (
              <ul className="divide-y divide-line-soft" aria-label="Autonomy licences">
                {v.licences.map((l) => (
                  <li key={l.id} className="space-y-2.5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <AgentAvatar name={l.agent_name ?? "?"} size="sm" />
                      <Link href={`/c/${cid}/agents/${l.agent_id}`} className="text-[13px] font-medium text-fg">{l.agent_name}</Link>
                      <span className="text-xs text-muted">{taskTypeLabel(l.task_type)}</span>
                      <span className="ml-auto"><AutonomyLevel level={l.level} frozen={l.frozen} /></span>
                    </div>
                    <Ladder licence={l} />
                    <div className="flex items-center justify-between gap-2">
                      <NextStep licence={l} />
                      <span className="text-xs text-faint tabular">{l.successes} ok · {l.failures} failed</span>
                    </div>
                    {(canAct && l.level !== "supervised" && !l.frozen) || (canAdmin && l.frozen) ? (
                      <div className="flex justify-end">
                        {canAct && l.level !== "supervised" && !l.frozen && <RevokeButton cid={cid} licence={l} />}
                        {canAdmin && l.frozen && <Button size="sm" variant="ghost" icon={<Unlock className="size-3.5" aria-hidden />} loading={unfreeze.isPending} onClick={() => unfreeze.mutate(l.id)}>Unfreeze</Button>}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Changes events={v.events} />
          <Rules v={v} />
        </div>
      </PageBody>
    </>
  );
}
