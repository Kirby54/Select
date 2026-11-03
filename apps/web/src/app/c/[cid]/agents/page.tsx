"use client";

import { Bot, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AgentFormDialog } from "@/components/agent-form";
import { AgentAvatar, AgentStatus, AutonomyLevel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Button, Card } from "@/components/ui/primitives";
import { taskTypeLabel } from "@/lib/format";
import { useAgents, useCompany, useCompanyId } from "@/lib/queries";
import type { Agent } from "@/lib/types";

export default function AgentsPage() {
  const cid = useCompanyId();
  const router = useRouter();
  const company = useCompany(cid);
  const agents = useAgents(cid);
  const [creating, setCreating] = useState(false);
  const canAdmin = company.data && ["owner", "admin"].includes(company.data.role);
  const managerName = (a: Agent) => agents.data?.find((m) => m.id === a.manager_id)?.name;
  return (
    <>
      <PageHeader
        title="Agents"
        description="Each agent is a role with a model, permissions and a licence per task type."
        actions={canAdmin && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setCreating(true)}>New agent</Button>}
      />
      <PageBody>
        <Card>
          {agents.isPending ? (
            <LoadingRows />
          ) : agents.isError ? (
            <ErrorState error={agents.error} retry={() => void agents.refetch()} />
          ) : (
            <DataTable
              caption="Agents"
              rows={agents.data}
              rowKey={(a) => a.id}
              rowLabel={(a) => `${a.name}, ${a.role}`}
              onRowClick={(a) => router.push(`/c/${cid}/agents/${a.id}`)}
              empty={
                <EmptyState icon={<Bot />} title="No agent yet" description="Create an agent, choose its model and the task types it may do."
                  action={canAdmin ? <Button size="sm" variant="primary" onClick={() => setCreating(true)}>New agent</Button> : undefined} />
              }
              columns={[
                { key: "name", header: "Agent", cell: (a) => <span className="flex items-center gap-2.5"><AgentAvatar name={a.name} size="sm" /><span><span className="text-fg">{a.name}</span> <span className="text-muted">· {a.role}</span></span></span> },
                { key: "status", header: "Status", cell: (a) => <AgentStatus agent={a} /> },
                { key: "model", header: "Model", cell: (a) => (a.provider ? <span className="font-mono text-xs text-muted">{a.provider}/{a.model}</span> : <span className="text-faint">—</span>), hideOnMobile: true },
                { key: "manager", header: "Reports to", cell: (a) => <span className="text-muted">{managerName(a) ?? "—"}</span>, hideOnMobile: true },
                {
                  key: "licences",
                  header: "Licences",
                  cell: (a) => (
                    <span className="flex flex-wrap gap-1">
                      {a.task_types.length === 0 && <span className="text-faint">No task type</span>}
                      {a.task_types.map((type) => {
                        const t = a.trust.find((x) => x.task_type === type);
                        return (
                          <span key={type} className="inline-flex items-center gap-1 text-xs text-muted">
                            {taskTypeLabel(type)} <AutonomyLevel level={t?.level ?? "supervised"} frozen={t?.frozen} compact />
                          </span>
                        );
                      })}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </PageBody>
      <AgentFormDialog cid={cid} open={creating} onOpenChange={setCreating} onSaved={(a) => router.push(`/c/${cid}/agents/${a.id}`)} />
    </>
  );
}
