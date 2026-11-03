"use client";

import { Lock, ShieldCheck, Unlock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AutonomyLevel, LevelSteps } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, Field, Progress, Select, Stat, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { percent, relative, taskTypeLabel } from "@/lib/format";
import { useAction, useAutonomy, useCompany, useCompanyId, usePersistentState } from "@/lib/queries";
import type { Licence } from "@/lib/types";

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

export default function AutonomyPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [days, setDays] = usePersistentState<number>("autonomy.days", 7);
  const autonomy = useAutonomy(cid, days);
  const unfreeze = useAction(cid, (id: string) => api(`/companies/${cid}/autonomy/${id}/unfreeze`, { method: "POST" }), { success: "Licence unfrozen" });
  const role = company.data?.role ?? "viewer";
  const canAct = role !== "viewer";
  const canAdmin = role === "owner" || role === "admin";

  if (autonomy.isPending) return <LoadingRows rows={10} />;
  if (autonomy.isError) return <ErrorState error={autonomy.error} retry={() => void autonomy.refetch()} />;
  const v = autonomy.data;
  const c = v.counter;

  return (
    <>
      <PageHeader
        title="Autonomy"
        description="Each agent earns the right to act alone, one task type at a time, from results the system verified."
        actions={
          <>
            <label htmlFor="a-period" className="sr-only">Period</label>
            <Select id="a-period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-7 w-32 text-xs">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </Select>
          </>
        }
      />
      <PageBody>
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-line">
            <Stat label="Finished without a human" value={percent(c.autonomy_rate)} tone="autonomous" hint={`${c.autonomous} of ${c.finished} tasks`} />
            <Stat label="Errors found afterwards" value={c.undetected_error_measurable ? percent(c.undetected_error_rate, 1) : "Not yet measurable"}
              tone={c.undetected_errors ? "danger" : undefined} hint={`${c.undetected_errors} in ${c.reviewed} human-reviewed`} />
            <Stat label="Autonomous licences" value={v.levels.autonomous} hint={`${v.levels.sampled} sampled · ${v.levels.supervised} supervised`} />
            <Stat label="Legal-risk work" value="Always supervised" hint="Payments, contracts, taxes, hiring" />
          </div>
          {c.finished > 0 && (
            <div className="border-t border-line px-4 py-3">
              <Progress value={c.autonomous} max={c.finished} tone="autonomous" label="Share of tasks finished without a human" />
              <p className="mt-2 text-xs text-faint">
                The two rates are always shown together: autonomy that lets errors through is not autonomy.
                {!c.undetected_error_measurable && " The error rate appears once 5 verified results have been reviewed by a human."}
              </p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Licences" description={`Promotion after ${v.policy.promote_after.supervised} verified successes in a row (supervised → sampled) and ${v.policy.promote_after.sampled} (sampled → autonomous). Sampled review rate ${Math.round(v.policy.sample_rate * 100)} %. Starting hypotheses, adjustable in Settings.`} />
          {v.licences.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="No licence yet" description="A licence appears when an agent produces its first verified result for a task type." />
          ) : (
            <DataTable
              caption="Autonomy licences"
              rows={v.licences}
              rowKey={(l) => l.id}
              columns={[
                { key: "agent", header: "Agent", cell: (l) => <Link className="text-fg hover:underline" href={`/c/${cid}/agents/${l.agent_id}`}>{l.agent_name}</Link> },
                { key: "type", header: "Task type", cell: (l) => <span className="text-muted">{taskTypeLabel(l.task_type)}</span> },
                { key: "level", header: "Level", cell: (l) => <AutonomyLevel level={l.level} frozen={l.frozen} /> },
                { key: "steps", header: "Cap", cell: (l) => <span className="flex items-center gap-2"><LevelSteps level={l.level} cap={l.cap} /><span className="text-2xs text-faint">{l.risk} risk</span></span>, hideOnMobile: true },
                {
                  key: "progress",
                  header: "Next step",
                  cell: (l) =>
                    l.frozen ? <Badge tone="danger">Frozen by a human</Badge> :
                    l.promotion_blocked ? <span className="text-xs text-faint">{l.level === "autonomous" ? "Top level" : "Capped by risk"}</span> :
                    l.next_threshold ? (
                      <span className="flex w-36 items-center gap-2">
                        <Progress value={l.streak} max={l.next_threshold} label={`${l.streak} of ${l.next_threshold} successes`} tone={l.level === "supervised" ? "supervised" : "accent"} />
                        <span className="text-2xs text-muted tabular">{l.streak}/{l.next_threshold}</span>
                      </span>
                    ) : null,
                },
                { key: "record", header: "Record", cell: (l) => <span className="text-xs text-muted tabular">{l.successes} ok · {l.failures} failed</span>, hideOnMobile: true },
                {
                  key: "actions",
                  header: "",
                  cell: (l) => (
                    <span className="flex justify-end gap-1">
                      {canAct && l.level !== "supervised" && !l.frozen && <RevokeButton cid={cid} licence={l} />}
                      {canAdmin && l.frozen && <Button size="sm" variant="ghost" icon={<Unlock className="size-3.5" aria-hidden />} loading={unfreeze.isPending} onClick={() => unfreeze.mutate(l.id)}>Unfreeze</Button>}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Why each level changed" description="Every promotion, demotion and revocation, with the evidence that caused it." />
          {v.events.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No change yet.</p> : (
            <ol className="divide-y divide-line">
              {v.events.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-fg">{e.agent_name}</span>
                    <span className="text-muted">{taskTypeLabel(e.task_type)}</span>
                    <AutonomyLevel level={e.from_level} compact /><span className="text-faint" aria-hidden>→</span><AutonomyLevel level={e.to_level} compact />
                    {e.is_demo && <Badge tone="sampled">Demo</Badge>}
                    <span className="ml-auto text-faint">{e.actor} · {relative(e.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-fg">{e.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </PageBody>
    </>
  );
}
