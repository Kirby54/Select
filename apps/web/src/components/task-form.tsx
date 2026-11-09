"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Dialog } from "./ui/overlay";
import { Button, Field, Input, Select, Textarea, cx } from "./ui/primitives";
import { api } from "@/lib/api";
import { FREE_FORM, taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useContracts, useProjects } from "@/lib/queries";
import type { Task } from "@/lib/types";

const schema = z.object({
  title: z.string().trim().min(1, "Say what should be done").max(200),
  task_type: z.string().min(1, "Choose what kind of work this is"),
  resource_scope: z.string().max(160),
  assignee_id: z.string(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  project_id: z.string(),
  due_date: z.string(),
  description: z.string().max(10_000),
  source: z.string().max(20_000),
});
type Values = z.infer<typeof schema>;

/**
 * One field and an agent by default. The task type (which contract checks the result), priority,
 * project, due date and source material sit under "More options".
 */
export function NewTaskDialog({ cid, open, onOpenChange, defaultAgentId }: { cid: string; open: boolean; onOpenChange: (o: boolean) => void; defaultAgentId?: string }) {
  const router = useRouter();
  const agents = useAgents(cid);
  const contracts = useContracts(cid);
  const projects = useProjects(cid);
  const [more, setMore] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", task_type: FREE_FORM, resource_scope: "", assignee_id: defaultAgentId ?? "", priority: "medium", project_id: "", due_date: "", description: "", source: "" },
  });
  const taskType = useWatch({ control: form.control, name: "task_type" });
  const assignee = useWatch({ control: form.control, name: "assignee_id" });
  const team = (agents.data ?? []).filter((a) => a.status !== "archived");
  const eligible = team.filter((a) => taskType === FREE_FORM || a.task_types.includes(taskType));
  const assigneeAllowed = !assignee || eligible.some((a) => a.id === assignee);
  const create = useAction(
    cid,
    (v: Values) =>
      api<Task>(`/companies/${cid}/tasks`, {
        method: "POST",
        body: {
          title: v.title,
          task_type: v.task_type,
          resource_scope: v.task_type === "code_change" ? v.resource_scope : null,
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
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-task" loading={create.isPending} disabled={!assigneeAllowed}>Create task</Button>
        </>
      }
    >
      <form id="new-task" noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" htmlFor="t-title" error={errors.title?.message} required>
            <Input id="t-title" aria-invalid={!!errors.title} placeholder="What should be done?" {...form.register("title")} autoFocus />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Details" htmlFor="t-desc">
            <Textarea id="t-desc" className="min-h-20" placeholder="Context, constraints, what a good result looks like" {...form.register("description")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Agent"
            htmlFor="t-assignee"
            error={!assigneeAllowed ? "This agent may not do this kind of work: choose another, or allow it on the agent." : undefined}
            hint={eligible.length === 0 && team.length > 0 ? "No agent may do this kind of work yet." : undefined}
          >
            <Select id="t-assignee" {...form.register("assignee_id")}>
              <option value="">Nobody yet</option>
              {eligible.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
              {assignee && !assigneeAllowed && team.filter((a) => a.id === assignee).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </Select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setMore(!more)}
            aria-expanded={more}
            className="inline-flex items-center gap-1.5 text-compact font-medium text-muted transition-colors hover:text-fg"
          >
            <ChevronDown className={cx("size-3.5 transition-transform duration-[120ms]", !more && "-rotate-90")} aria-hidden />
            More options
          </button>
        </div>
        {taskType === "code_change" && (
          <div className="sm:col-span-2">
            <Field label="Repository scope" htmlFor="t-repo" hint="Required. An admin must grant this exact repo to the agent. Example: repo:Kirby54/Select.">
              <Input id="t-repo" placeholder="repo:owner/name" required {...form.register("resource_scope")} />
            </Field>
          </div>
        )}
        {more && (
          <>
            <Field label="Task type" htmlFor="t-type" error={errors.task_type?.message} hint="Decides which checks the result must pass.">
              <Select id="t-type" aria-invalid={!!errors.task_type} {...form.register("task_type")}>
                {(contracts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{taskTypeLabel(c.id)}</option>
                ))}
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
              <Field label="Source material" htmlFor="t-source" hint="An e-mail, a brief, a document. Agents quote it but never take orders from it.">
                <Textarea id="t-source" className="min-h-28 font-mono text-xs" {...form.register("source")} />
              </Field>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
