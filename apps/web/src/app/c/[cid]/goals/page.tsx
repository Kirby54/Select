"use client";

import { Plus, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/overlay";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useAction, useCompany, useCompanyId, useGoals } from "@/lib/queries";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const goals = useGoals(cid);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [form, setForm] = useState({ title: "", description: "", target_date: "", status: "active" });
  const save = useAction(cid, (body: typeof form) =>
    editing && editing !== "new"
      ? api(`/companies/${cid}/goals/${editing.id}`, { method: "PATCH", body: { ...body, target_date: body.target_date || null } })
      : api(`/companies/${cid}/goals`, { method: "POST", body: { ...body, target_date: body.target_date || null } }),
  { success: "Goal saved", onSuccess: () => setEditing(null) });
  const canWrite = company.data && company.data.role !== "viewer";
  const open = (g: Goal | "new") => {
    setForm(g === "new" ? { title: "", description: "", target_date: "", status: "active" } : { title: g.title, description: g.description, target_date: g.target_date ?? "", status: g.status });
    setEditing(g);
  };
  return (
    <>
      <PageHeader title="Goals" description="What the company is trying to achieve. Tasks and projects can point at a goal."
        actions={canWrite && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => open("new")}>New goal</Button>} />
      <PageBody>
        <Card>
          {goals.isPending ? <LoadingRows /> : goals.isError ? <ErrorState error={goals.error} retry={() => void goals.refetch()} /> : (
            <DataTable caption="Goals" rows={goals.data} rowKey={(g) => g.id} rowLabel={(g) => g.title} onRowClick={canWrite ? open : undefined}
              empty={<EmptyState icon={<Target />} title="No goal yet" description="Write down what this company aims for, for example “Answer every quote request within a day”." />}
              columns={[
                { key: "title", header: "Goal", cell: (g) => <span className="text-fg">{g.title}</span> },
                { key: "status", header: "Status", cell: (g) => <Badge tone={g.status === "achieved" ? "success" : "neutral"} dot>{g.status}</Badge> },
                { key: "date", header: "Target", cell: (g) => <span className="text-muted">{formatDay(g.target_date)}</span> },
                { key: "tasks", header: "Tasks", cell: (g) => <Link onClick={(e) => e.stopPropagation()} href={`/c/${cid}/tasks`} className="text-muted tabular hover:text-fg">{g.task_count}</Link>, align: "right" },
              ]} />
          )}
        </Card>
      </PageBody>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "New goal" : "Edit goal"}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!form.title.trim()} onClick={() => save.mutate(form)}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Title" htmlFor="g-title" required error={!form.title.trim() ? "A title is required" : undefined}><Input id="g-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description" htmlFor="g-desc"><Textarea id="g-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target date" htmlFor="g-date"><Input id="g-date" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></Field>
            <Field label="Status" htmlFor="g-status"><Select id="g-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="achieved">Achieved</option><option value="dropped">Dropped</option></Select></Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}
