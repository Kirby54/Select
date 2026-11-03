"use client";

import { Archive, ArrowDownRight, ArrowUpRight, Pause, Pencil, Play, PlugZap } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { AgentFormDialog } from "@/components/agent-form";
import { AgentAvatar, AgentStatus, AutonomyLevel, LicenceLadder, LicenceNextStep, TaskStatusBadge, providerLabel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, DemoTag, cx } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDate, money, relative, taskTypeLabel } from "@/lib/format";
import { useAction, useAgent, useAgents, useAutonomy, useCompany } from "@/lib/queries";

export default function AgentPage({ params }: { params: Promise<{ cid: string; aid: string }> }) {
  const { cid, aid } = use(params);
  const company = useCompany(cid);
  const agent = useAgent(cid, aid);
  const agents = useAgents(cid);
  const autonomy = useAutonomy(cid, 30);
  const [editing, setEditing] = useState(false);
  const setStatus = useAction(cid, (action: "pause" | "resume" | "archive") => api(`/companies/${cid}/agents/${aid}/${action}`, { method: "POST" }), {
    success: (r) => `Agent ${(r as { status: string }).status}`,
  });

  if (agent.isPending) return <LoadingRows rows={10} />;
  if (agent.isError) return <ErrorState error={agent.error} retry={() => void agent.refetch()} />;
  const a = agent.data;
  const role = company.data?.role ?? "viewer";
  const canAdmin = role === "owner" || role === "admin";
  const manager = agents.data?.find((m) => m.id === a.manager_id);
  const reports = (agents.data ?? []).filter((m) => m.manager_id === a.id);
  const licences = (autonomy.data?.licences ?? []).filter((l) => l.agent_id === a.id);
  const caps = autonomy.data?.caps ?? {};

  return (
    <>
      <PageHeader
        title={a.name}
        description={a.role}
        meta={<AgentStatus agent={a} />}
        actions={canAdmin && !a.is_demo_agent ? <>
          <Button size="sm" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(true)}>Edit</Button>
          {a.status === "active" ? (
            <Button size="sm" variant="ghost" icon={<Pause className="size-3.5" aria-hidden />} loading={setStatus.isPending} onClick={() => setStatus.mutate("pause")}>Pause</Button>
          ) : a.status === "paused" ? (
            <Button size="sm" variant="ghost" icon={<Play className="size-3.5" aria-hidden />} loading={setStatus.isPending} onClick={() => setStatus.mutate("resume")}>Resume</Button>
          ) : null}
          {a.status !== "archived" && (
            <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<Archive className="size-3.5" aria-hidden />}>Archive</Button>}
              title={`Archive ${a.name}?`} description="The agent stops taking work. Its history, receipts and costs are kept." confirmLabel="Archive agent"
              onConfirm={() => setStatus.mutateAsync("archive")} />
          )}
        </> : undefined}
      />
      <PageBody className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:space-y-0">
        <div className="min-w-0 space-y-4">
          {!a.connected && !a.is_demo_agent && (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
              <PlugZap className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
              <p>
                This agent cannot run live yet{a.provider ? `: add an enabled ${providerLabel(a.provider)} connection` : ": choose a provider and a model"}.
                Outputs can still be submitted through the API and are verified the same way.
                {a.provider && <> <Link href={`/c/${cid}/connections`} className="font-medium text-accent hover:text-accent-strong">Open Connections</Link></>}
              </p>
            </div>
          )}
          <Card>
            <CardHeader title="Licences by task type" description="Earned from verified results; capped by each contract's risk class" />
            {a.task_types.length === 0 ? (
              <EmptyState compact title="No task type allowed" description="Edit the agent to choose what it may work on." />
            ) : (
              <ul className="divide-y divide-line-soft">
                {a.task_types.map((type) => {
                  const licence = licences.find((l) => l.task_type === type);
                  const trust = a.trust.find((x) => x.task_type === type);
                  const cap = caps[type] ?? "supervised";
                  return (
                    <li key={type} className="grid items-center gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[150px_auto_minmax(200px,1fr)_auto]">
                      <span className="text-[13px] text-fg">{taskTypeLabel(type)}</span>
                      <AutonomyLevel level={trust?.level ?? "supervised"} frozen={trust?.frozen} />
                      {licence ? <LicenceLadder licence={licence} /> : <span className="text-xs text-faint">No verified result yet</span>}
                      <span className="flex flex-col items-start gap-0.5 sm:items-end">
                        {licence ? <LicenceNextStep licence={licence} /> : cap !== "autonomous" ? <Badge>{`capped at ${cap}`}</Badge> : null}
                        {trust && <span className="text-xs text-faint tabular">{trust.successes} ok · {trust.failures} failed · streak {trust.streak}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Licence history" description="Why the level changed, with the evidence" />
            {a.trust_events.length === 0 ? <EmptyState compact title="No promotion or demotion yet" /> : (
              <ol className="divide-y divide-line-soft">
                {a.trust_events.map((e) => {
                  const up = e.kind === "promote";
                  return (
                    <li key={e.id} className="flex gap-3 px-4 py-3">
                      <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", up ? "bg-autonomous/12 text-autonomous" : "bg-danger/12 text-danger")} aria-hidden>
                        {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted">{taskTypeLabel(e.task_type)}</span>
                          <AutonomyLevel level={e.from_level} compact /> <span className="text-faint" aria-label="to">→</span> <AutonomyLevel level={e.to_level} compact />
                          {e.is_demo && <DemoTag />}
                          <span className="ml-auto text-faint">{e.actor} · {relative(e.created_at)}</span>
                        </div>
                        <p className="mt-1 text-[13px] text-muted">{e.reason}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <Card>
            <CardHeader title="Tasks" description={`${a.tasks.length} assigned`} actions={<Link href={`/c/${cid}/tasks`} className="text-xs font-medium text-accent hover:text-accent-strong">All tasks</Link>} />
            {a.tasks.length === 0 ? <EmptyState compact title="No task assigned" /> : (
              <ul className="divide-y divide-line-soft">
                {a.tasks.slice(0, 15).map((t) => (
                  <li key={t.id}>
                    <Link href={`/c/${cid}/tasks/${t.id}`} className="flex h-9 items-center gap-3 px-4 transition-colors hover:bg-hover">
                      <span className="w-11 shrink-0 font-mono text-xs text-faint">{t.key}</span>
                      <span className="flex-1 truncate text-[13px]">{t.title}</span>
                      <TaskStatusBadge status={t.status} plain />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Runs" description="Last 25 executions" />
            {a.runs.length === 0 ? <EmptyState compact title="No run yet" /> : (
              <ul className="divide-y divide-line-soft text-[13px]">
                {a.runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "accent"}>{r.status}</Badge>
                    <Badge>{r.mode}</Badge>
                    <span className="text-xs text-muted">attempt {r.attempt}</span>
                    {r.error && <span className="truncate text-xs text-danger">{r.error}</span>}
                    <span className="ml-auto text-xs text-faint">{formatDate(r.started_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3 border-b border-line-soft p-4">
              <AgentAvatar name={a.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{a.name}</p>
                <p className="truncate text-xs text-muted">{a.role}</p>
                <p className="mt-1 truncate font-mono text-2xs text-faint">{a.is_demo_agent ? "recorded outputs" : a.provider ? `${providerLabel(a.provider)} · ${a.model}` : "no model"}</p>
              </div>
            </div>
            <dl className="space-y-2.5 p-4 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-faint">Reports to</dt><dd>{manager ? <Link className="text-accent hover:text-accent-strong" href={`/c/${cid}/agents/${manager.id}`}>{manager.name}</Link> : <span className="text-muted">—</span>}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-faint">Direct reports</dt><dd className="text-right text-muted">{reports.map((r) => r.name).join(", ") || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-faint">Monthly budget</dt><dd className="text-muted tabular">{a.monthly_budget === "0" || a.monthly_budget === "0.00" ? "No limit" : money(a.monthly_budget)}</dd></div>
              {a.costs.map((c) => <div key={c.kind} className="flex justify-between gap-3"><dt className="text-faint">Cost ({c.kind})</dt><dd className="text-muted tabular">{money(c.amount, "", 4)}</dd></div>)}
              <div className="flex justify-between gap-3"><dt className="text-faint">Permissions</dt><dd className="text-right text-muted">{a.permissions.join(", ").replaceAll("_", " ") || "none"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-faint">Contracts</dt><dd className="text-right text-muted">{a.contracts.map(taskTypeLabel).join(", ") || "—"}</dd></div>
            </dl>
          </Card>
          {(a.description || a.objectives || a.instructions) && (
            <Card>
              <CardHeader title="Brief" />
              <div className="space-y-3 p-4 text-[13px]">
                {a.description && <p className="text-muted">{a.description}</p>}
                {a.objectives && <div><p className="text-xs text-faint">Objectives</p><p className="whitespace-pre-wrap text-muted">{a.objectives}</p></div>}
                {a.instructions && <div><p className="text-xs text-faint">Instructions</p><p className="whitespace-pre-wrap text-muted">{a.instructions}</p></div>}
              </div>
            </Card>
          )}
        </div>
      </PageBody>
      {editing && <AgentFormDialog cid={cid} agent={a} open={editing} onOpenChange={setEditing} />}
    </>
  );
}
