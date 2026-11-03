"use client";

import { Archive, Pause, Pencil, Play } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { AgentFormDialog } from "@/components/agent-form";
import { AgentAvatar, AgentStatus, AutonomyLevel, LevelSteps, TaskStatusBadge } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
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
  const caps = autonomy.data?.caps ?? {};

  return (
    <>
      <PageHeader
        title={a.name}
        description={a.role}
        meta={<><AgentStatus agent={a} />{a.provider && <span className="font-mono text-xs text-muted">{a.provider}/{a.model}</span>}</>}
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
          <Card>
            <CardHeader title="Licences by task type" description="Earned from verified results; capped by each contract's risk class." />
            {a.task_types.length === 0 ? (
              <EmptyState title="No task type allowed" description="Edit the agent to choose what it may work on." />
            ) : (
              <ul className="divide-y divide-line">
                {a.task_types.map((type) => {
                  const t = a.trust.find((x) => x.task_type === type);
                  const cap = caps[type] ?? "supervised";
                  return (
                    <li key={type} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <span className="w-36 text-sm">{taskTypeLabel(type)}</span>
                      <AutonomyLevel level={t?.level ?? "supervised"} frozen={t?.frozen} />
                      <LevelSteps level={t?.level ?? "supervised"} cap={cap} />
                      <span className="text-xs text-muted tabular">{t ? `${t.successes} ok · ${t.failures} failed · streak ${t.streak}` : "No result yet"}</span>
                      {cap !== "autonomous" && <Badge>{`capped at ${cap}`}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Licence history" />
            {a.trust_events.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No promotion or demotion yet.</p> : (
              <ol className="divide-y divide-line">
                {a.trust_events.map((e) => (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <AutonomyLevel level={e.from_level} compact /> <span className="text-faint">→</span> <AutonomyLevel level={e.to_level} compact />
                      <span className="text-muted">{taskTypeLabel(e.task_type)}</span>
                      <span className="ml-auto text-faint">{relative(e.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-fg">{e.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card>
            <CardHeader title="Tasks" />
            {a.tasks.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No task assigned.</p> : (
              <ul className="divide-y divide-line">
                {a.tasks.slice(0, 15).map((t) => (
                  <li key={t.id}>
                    <Link href={`/c/${cid}/tasks/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised/60">
                      <span className="font-mono text-xs text-faint">{t.key}</span>
                      <span className="flex-1 truncate text-sm">{t.title}</span>
                      <TaskStatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Execution history" description="Last 25 runs" />
            {a.runs.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No run yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {a.runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
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
            <div className="flex items-center gap-3 border-b border-line p-4">
              <AgentAvatar name={a.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted">{a.role}</p>
              </div>
            </div>
            <dl className="space-y-2.5 p-4 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-faint">Reports to</dt><dd>{manager ? <Link className="text-accent" href={`/c/${cid}/agents/${manager.id}`}>{manager.name}</Link> : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-faint">Direct reports</dt><dd className="text-muted">{reports.map((r) => r.name).join(", ") || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-faint">Monthly budget</dt><dd className="text-muted tabular">{a.monthly_budget === "0" || a.monthly_budget === "0.00" ? "No limit" : money(a.monthly_budget)}</dd></div>
              {a.costs.map((c) => <div key={c.kind} className="flex justify-between gap-3"><dt className="text-faint">Cost ({c.kind})</dt><dd className="text-muted tabular">{money(c.amount, "", 4)}</dd></div>)}
              <div className="flex justify-between gap-3"><dt className="text-faint">Permissions</dt><dd className="text-right text-muted">{a.permissions.join(", ") || "none"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-faint">Contracts</dt><dd className="text-right text-muted">{a.contracts.map(taskTypeLabel).join(", ") || "—"}</dd></div>
            </dl>
          </Card>
          {(a.description || a.objectives || a.instructions) && (
            <Card>
              <CardHeader title="Brief" />
              <div className="space-y-3 p-4 text-sm">
                {a.description && <p className="text-muted">{a.description}</p>}
                {a.objectives && <div><p className="text-xs text-faint">Objectives</p><p className="whitespace-pre-wrap text-muted">{a.objectives}</p></div>}
                {a.instructions && <div><p className="text-xs text-faint">Instructions</p><p className="whitespace-pre-wrap text-muted">{a.instructions}</p></div>}
              </div>
            </Card>
          )}
          {!a.connected && !a.is_demo_agent && (
            <p className="rounded-md border border-line px-3 py-2.5 text-xs text-muted">
              This agent cannot run live yet{a.provider ? `: add an enabled ${a.provider} connection` : ": choose a provider and model"}. Outputs can still be submitted through the API and are verified the same way.
            </p>
          )}
        </div>
      </PageBody>
      {editing && <AgentFormDialog cid={cid} agent={a} open={editing} onOpenChange={setEditing} />}
    </>
  );
}
