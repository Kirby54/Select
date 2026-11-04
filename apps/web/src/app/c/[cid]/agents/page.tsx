"use client";

import { ArrowUpRight, Bot, Pause, Pencil, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { AgentFormDialog } from "@/components/agent-form";
import { AgentAvatar, AgentStatus, AutonomyLevel, LEVELS, LevelMeter, LicenceLadder, LicenceNextStep, TaskStatusBadge, providerLabel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Button, Card, Input } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { money, taskTypeLabel } from "@/lib/format";
import { useAction, useAgent, useAgents, useAutonomy, useCompany, useCompanyId } from "@/lib/queries";
import type { Agent, Level } from "@/lib/types";

function LicenceSummary({ agent }: { agent: Agent }) {
  if (agent.task_types.length === 0) return <span className="text-faint">No task type</span>;
  const count = (l: Level) => agent.task_types.filter((t) => (agent.trust.find((x) => x.task_type === t)?.level ?? "supervised") === l).length;
  const present = [...LEVELS].reverse().filter((l) => count(l) > 0);
  return (
    <span className="flex items-center gap-3" aria-label={present.map((l) => `${count(l)} ${l}`).join(", ")}>
      {present.map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5 text-xs text-muted tabular" title={`${count(l)} ${l}`}>
          <LevelMeter level={l} />{count(l)} {l}
        </span>
      ))}
    </span>
  );
}

function AgentInspector({ cid, id, canAdmin, onEdit }: { cid: string; id: string; canAdmin: boolean; onEdit: (a: Agent) => void }) {
  const agent = useAgent(cid, id);
  const autonomy = useAutonomy(cid, 30);
  const setStatus = useAction(cid, (action: "pause" | "resume") => api(`/companies/${cid}/agents/${id}/${action}`, { method: "POST" }), {
    success: (r) => `Agent ${(r as { status: string }).status}`,
  });
  if (agent.isPending) return <LoadingRows rows={6} />;
  if (agent.isError) return <ErrorState error={agent.error} compact />;
  const a = agent.data;
  const licences = (autonomy.data?.licences ?? []).filter((l) => l.agent_id === a.id);
  return (
    <div className="divide-y divide-line-soft">
      <section className="flex items-center gap-3 px-5 py-4">
        <AgentAvatar name={a.name} role={a.role} size="lg" />
        <div className="min-w-0 flex-1">
          <AgentStatus agent={a} />
          <p className="mt-1 truncate font-mono text-xs text-muted">{a.is_demo_agent ? "recorded outputs" : a.provider ? `${providerLabel(a.provider)} · ${a.model}` : "no model · API submissions"}</p>
        </div>
        {canAdmin && !a.is_demo_agent && (
          <div className="flex gap-1">
            <Button size="sm" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => onEdit(a)}>Edit</Button>
            {a.status === "active" ? (
              <Button size="sm" variant="ghost" icon={<Pause className="size-3.5" aria-hidden />} loading={setStatus.isPending} onClick={() => setStatus.mutate("pause")}>Pause</Button>
            ) : a.status === "paused" ? (
              <Button size="sm" variant="ghost" icon={<Play className="size-3.5" aria-hidden />} loading={setStatus.isPending} onClick={() => setStatus.mutate("resume")}>Resume</Button>
            ) : null}
          </div>
        )}
      </section>
      <section className="px-5 py-4">
        <h3 className="mb-3 text-xs font-medium text-muted">Licences</h3>
        {a.task_types.length === 0 ? (
          <p className="text-[13px] text-faint">No task type allowed yet.</p>
        ) : (
          <ul className="space-y-3.5">
            {a.task_types.map((type) => {
              const licence = licences.find((l) => l.task_type === type);
              const trust = a.trust.find((t) => t.task_type === type);
              return (
                <li key={type} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-fg">{taskTypeLabel(type)}</span>
                    <AutonomyLevel level={trust?.level ?? "supervised"} frozen={trust?.frozen} />
                  </div>
                  {licence ? (
                    <>
                      <LicenceLadder licence={licence} />
                      <div className="flex items-center justify-between gap-2"><LicenceNextStep licence={licence} /><span className="text-xs text-faint tabular">{licence.successes} ok · {licence.failures} failed</span></div>
                    </>
                  ) : (
                    <p className="text-xs text-faint">No verified result yet: starts supervised.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="px-5 py-4">
        <h3 className="mb-2 text-xs font-medium text-muted">Recent tasks</h3>
        {a.tasks.length === 0 ? <p className="text-[13px] text-faint">No task assigned.</p> : (
          <ul className="-mx-2">
            {a.tasks.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link href={`/c/${cid}/tasks/${t.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-hover">
                  <span className="w-11 shrink-0 font-mono text-xs text-faint">{t.key}</span>
                  <span className="flex-1 truncate text-[13px]">{t.title}</span>
                  <TaskStatusBadge status={t.status} plain />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid grid-cols-2 gap-3 px-5 py-4 text-xs">
        <div><p className="text-faint">Monthly budget</p><p className="mt-0.5 text-[13px] text-fg tabular">{a.monthly_budget === "0" || a.monthly_budget === "0.00" ? "No limit" : money(a.monthly_budget)}</p></div>
        {a.costs.map((c) => <div key={c.kind}><p className="text-faint">Cost ({c.kind})</p><p className="mt-0.5 text-[13px] text-fg tabular">{money(c.amount, "", 4)}</p></div>)}
        <div className="col-span-2"><p className="text-faint">Permissions</p><p className="mt-0.5 text-[13px] text-muted">{a.permissions.join(", ").replaceAll("_", " ") || "none"}</p></div>
      </section>
    </div>
  );
}

function AgentsInner() {
  const cid = useCompanyId();
  const router = useRouter();
  const params = useSearchParams();
  const company = useCompany(cid);
  const agents = useAgents(cid);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const canAdmin = !!company.data && ["owner", "admin"].includes(company.data.role);

  // "?new=1" (from the command palette) opens the form; closing it clears the parameter.
  const wantsNew = params.get("new") === "1";
  const createOpen = creating || (wantsNew && canAdmin);
  const setCreateOpen = (open: boolean) => {
    setCreating(open);
    if (!open && wantsNew) router.replace(`/c/${cid}/agents`);
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (agents.data ?? []).filter((a) => !q || `${a.name} ${a.role} ${a.model ?? ""}`.toLowerCase().includes(q));
  }, [agents.data, query]);
  const managerName = (a: Agent) => agents.data?.find((m) => m.id === a.manager_id)?.name;
  const current = agents.data?.find((a) => a.id === selected);

  return (
    <>
      <PageHeader
        title="Agents"
        description="Each agent is a post with a model, permissions and a licence per task type"
        actions={canAdmin && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setCreating(true)}>New agent</Button>}
      />
      <PageBody>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <label htmlFor="agent-filter" className="sr-only">Filter agents</label>
            <Input id="agent-filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name, role or model" className="h-7 max-w-64" />
            <span className="ml-auto text-xs text-faint tabular">{rows.length} of {agents.data?.length ?? 0}</span>
          </div>
          {agents.isPending ? (
            <LoadingRows />
          ) : agents.isError ? (
            <ErrorState error={agents.error} retry={() => void agents.refetch()} />
          ) : (
            <DataTable
              caption="Agents"
              rows={rows}
              rowKey={(a) => a.id}
              rowLabel={(a) => `${a.name}, ${a.role}`}
              selectedKey={selected}
              comfortable
              onRowClick={(a) => setSelected(a.id)}
              empty={
                <EmptyState icon={<Bot />} title={query ? "No agent matches" : "No agent yet"} description={query ? "Try another name, role or model." : "Create an agent, choose its model and the task types it may do."}
                  action={canAdmin && !query ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setCreating(true)}>New agent</Button> : undefined} />
              }
              columns={[
                {
                  key: "name",
                  header: "Agent",
                  className: "w-[30%]",
                  cell: (a) => (
                    <span className="flex items-center gap-2.5">
                      <AgentAvatar name={a.name} role={a.role} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-fg">{a.name}</span>
                        <span className="block truncate text-xs text-muted">{a.role}</span>
                      </span>
                    </span>
                  ),
                },
                { key: "status", header: "Status", cell: (a) => <AgentStatus agent={a} /> },
                { key: "model", header: "Model", cell: (a) => (a.is_demo_agent ? <span className="text-xs text-faint">recorded</span> : a.provider ? <span className="font-mono text-xs text-muted">{providerLabel(a.provider)} · {a.model}</span> : <span className="text-faint">—</span>), hideOnMobile: true },
                { key: "licences", header: "Licences", cell: (a) => <LicenceSummary agent={a} /> },
                { key: "manager", header: "Reports to", cell: (a) => <span className="text-muted">{managerName(a) ?? "—"}</span>, hideOnMobile: true },
              ]}
            />
          )}
        </Card>
      </PageBody>
      <DetailPanel
        open={!!current}
        onOpenChange={(o) => !o && setSelected(null)}
        title={current?.name ?? ""}
        subtitle={current?.role}
        actions={current && <Link href={`/c/${cid}/agents/${current.id}`} className="mr-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-hover hover:text-accent-strong">Full page <ArrowUpRight className="size-3" aria-hidden /></Link>}
      >
        {current && <AgentInspector cid={cid} id={current.id} canAdmin={canAdmin} onEdit={setEditing} />}
      </DetailPanel>
      <AgentFormDialog cid={cid} open={createOpen} onOpenChange={setCreateOpen} onSaved={(a) => router.push(`/c/${cid}/agents/${a.id}`)} />
      {editing && <AgentFormDialog cid={cid} agent={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <AgentsInner />
    </Suspense>
  );
}
