"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Dialog } from "./ui/overlay";
import { Button, Field, Input, Select, Textarea } from "./ui/primitives";
import { api } from "@/lib/api";
import { taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useContracts, useProjects } from "@/lib/queries";
import type { Task } from "@/lib/types";

const schema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200),
  task_type: z.string().min(1, "Choose what kind of work this is"),
  assignee_id: z.string(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  project_id: z.string(),
  due_date: z.string(),
  description: z.string().max(10_000),
  source: z.string().max(20_000),
});
type Values = z.infer<typeof schema>;

export function NewTaskDialog({ cid, open, onOpenChange }: { cid: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const agents = useAgents(cid);
  const contracts = useContracts(cid);
  const projects = useProjects(cid);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", task_type: "", assignee_id: "", priority: "medium", project_id: "", due_date: "", description: "", source: "" },
  });
  const taskType = useWatch({ control: form.control, name: "task_type" });
  const eligible = (agents.data ?? []).filter((a) => a.status !== "archived" && (!taskType || a.task_types.includes(taskType)));
  const create = useAction(
    cid,
    (v: Values) =>
      api<Task>(`/companies/${cid}/tasks`, {
        method: "POST",
        body: {
          title: v.title,
          task_type: v.task_type,
          assignee_id: v.assignee_id || null,
          priority: v.priority,
          project_id: v.project_id || null,
          due_date: v.due_date || null,
          description: v.description,
          sources: v.source.trim() ? [{ id: "msg-1", text: v.source.trim() }] : [],
        },
      }),
    {
      success: (t) => `${t.key} created`,
      onSuccess: (t) => {
        form.reset();
        onOpenChange(false);
        router.push(`/c/${cid}/tasks/${t.id}`);
      },
    },
  );
  const errors = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="New task"
      description="The task type decides which contract checks the result."
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" variant="primary" type="submit" form="new-task" loading={create.isPending}>Create task</Button>
        </>
      }
    >
      <form id="new-task" noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" htmlFor="t-title" error={errors.title?.message} required>
            <Input id="t-title" aria-invalid={!!errors.title} {...form.register("title")} autoFocus />
          </Field>
        </div>
        <Field label="Task type" htmlFor="t-type" error={errors.task_type?.message} required>
          <Select id="t-type" aria-invalid={!!errors.task_type} {...form.register("task_type")}>
            <option value="">Choose…</option>
            {(contracts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{taskTypeLabel(c.id)} · {c.risk} risk</option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee" htmlFor="t-assignee" hint={taskType && eligible.length === 0 ? "No agent may do this type yet: allow it on an agent." : "Only agents allowed to do this type"}>
          <Select id="t-assignee" {...form.register("assignee_id")}>
            <option value="">Unassigned</option>
            {eligible.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="t-priority">
          <Select id="t-priority" {...form.register("priority")}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
        <Field label="Project" htmlFor="t-project">
          <Select id="t-project" {...form.register("project_id")}>
            <option value="">No project</option>
            {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="t-due">
          <Input id="t-due" type="date" {...form.register("due_date")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="t-desc">
            <Textarea id="t-desc" className="min-h-16" {...form.register("description")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Source material (e.g. the customer's e-mail)" htmlFor="t-source" hint="Treated as untrusted data: agents quote it, never obey it. Referenced as source:msg-1.">
            <Textarea id="t-source" className="min-h-28 font-mono text-xs" {...form.register("source")} />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
