"use client";

import { FolderKanban, Plus } from "lucide-react";
import { useState } from "react";

import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/overlay";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAction, useCompany, useCompanyId, useGoals, useProjects } from "@/lib/queries";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const projects = useProjects(cid);
  const goals = useGoals(cid);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", goal_id: "", status: "active" });
  const save = useAction(cid, (body: typeof form) => {
    const payload = { ...body, goal_id: body.goal_id || null };
    return editing && editing !== "new"
      ? api(`/companies/${cid}/projects/${editing.id}`, { method: "PATCH", body: payload })
      : api(`/companies/${cid}/projects`, { method: "POST", body: payload });
  }, { success: "Project saved", onSuccess: () => setEditing(null) });
  const canWrite = company.data && company.data.role !== "viewer";
  const open = (p: Project | "new") => {
    setForm(p === "new" ? { name: "", description: "", goal_id: "", status: "active" } : { name: p.name, description: p.description, goal_id: p.goal_id ?? "", status: p.status });
    setEditing(p);
  };
  const goalName = (id: string | null) => goals.data?.find((g) => g.id === id)?.title;
  return (
    <>
      <PageHeader title="Projects" description="Groups of related tasks, optionally serving a goal. Costs can be broken down by project."
        actions={canWrite && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => open("new")}>New project</Button>} />
      <PageBody>
        <Card>
          {projects.isPending ? <LoadingRows /> : projects.isError ? <ErrorState error={projects.error} retry={() => void projects.refetch()} /> : (
            <DataTable caption="Projects" rows={projects.data} rowKey={(p) => p.id} rowLabel={(p) => p.name} onRowClick={canWrite ? open : undefined}
              empty={<EmptyState icon={<FolderKanban />} title="No project yet" description="Group tasks, for example “Kitchen renovations, spring”." />}
              columns={[
                { key: "name", header: "Project", cell: (p) => <span className="text-fg">{p.name}</span> },
                { key: "status", header: "Status", cell: (p) => <Badge tone={p.status === "done" ? "success" : p.status === "paused" ? "warning" : "accent"}>{p.status}</Badge> },
                { key: "goal", header: "Goal", cell: (p) => <span className="text-muted">{goalName(p.goal_id) ?? "—"}</span>, hideOnMobile: true },
                { key: "tasks", header: "Tasks", cell: (p) => <span className="text-muted tabular">{p.task_count}</span>, align: "right" },
              ]} />
          )}
        </Card>
      </PageBody>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "New project" : "Edit project"}
        footer={<><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate(form)}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name" htmlFor="p-name" required error={!form.name.trim() ? "A name is required" : undefined}><Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description" htmlFor="p-desc"><Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Goal" htmlFor="p-goal"><Select id="p-goal" value={form.goal_id} onChange={(e) => setForm({ ...form, goal_id: e.target.value })}><option value="">No goal</option>{(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
            <Field label="Status" htmlFor="p-status"><Select id="p-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option></Select></Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}
