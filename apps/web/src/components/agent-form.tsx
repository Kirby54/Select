"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Dialog } from "./ui/overlay";
import { Button, Checkbox, Field, Input, Select, Textarea } from "./ui/primitives";
import { ApiError, api } from "@/lib/api";
import { taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useConnections, useContracts } from "@/lib/queries";
import type { Agent } from "@/lib/types";

const PERMISSIONS = [
  { id: "read_messages", label: "Read incoming messages", description: "Sees the source material attached to its tasks." },
  { id: "read_catalog", label: "Read the catalog", description: "Can reference catalog items and prices." },
  { id: "draft_external", label: "Draft external messages", description: "May prepare e-mails or posts. Sending always goes through Select's rules." },
] as const;

const schema = z.object({
  name: z.string().trim().min(1, "A name is required").max(80),
  role: z.string().trim().min(1, "A role is required").max(80),
  description: z.string().max(2000),
  objectives: z.string().max(2000),
  instructions: z.string().max(8000),
  manager_id: z.string(),
  provider: z.string(),
  model: z.string().max(120),
  task_types: z.array(z.string()),
  permissions: z.array(z.string()),
  monthly_budget: z.string().regex(/^\d+(\.\d{1,2})?$/, "Use a number such as 20 or 20.00"),
}).refine((v) => !v.provider || v.model.trim().length > 0, { message: "Choose a model for this provider", path: ["model"] });
type Values = z.infer<typeof schema>;

export function AgentFormDialog({ cid, agent, open, onOpenChange, onSaved }: {
  cid: string;
  agent?: Agent;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (a: Agent) => void;
}) {
  const agents = useAgents(cid);
  const contracts = useContracts(cid);
  const connections = useConnections(cid);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: agent?.name ?? "",
      role: agent?.role ?? "",
      description: agent?.description ?? "",
      objectives: agent?.objectives ?? "",
      instructions: agent?.instructions ?? "",
      manager_id: agent?.manager_id ?? "",
      provider: agent?.provider ?? "",
      model: agent?.model ?? "",
      task_types: agent?.task_types ?? [],
      permissions: agent?.permissions ?? ["read_messages"],
      monthly_budget: agent?.monthly_budget ?? "0",
    },
  });
  const provider = useWatch({ control: form.control, name: "provider" });
  const models = connections.data?.find((c) => c.provider === provider)?.models ?? [];
  const save = useAction(
    cid,
    (v: Values) => {
      const body = {
        name: v.name, role: v.role, description: v.description, objectives: v.objectives, instructions: v.instructions,
        provider: v.provider || null, model: v.model.trim() || null, task_types: v.task_types, permissions: v.permissions,
        monthly_budget: v.monthly_budget,
      };
      return agent
        ? api<Agent>(`/companies/${cid}/agents/${agent.id}`, { method: "PATCH", body: { ...body, version: agent.version, ...(v.manager_id ? { manager_id: v.manager_id } : { clear_manager: true }) } })
        : api<Agent>(`/companies/${cid}/agents`, { method: "POST", body: { ...body, manager_id: v.manager_id || null } });
    },
    { success: agent ? "Agent saved" : "Agent created", onSuccess: (a) => { onOpenChange(false); onSaved?.(a); } },
  );
  const conflict = save.error instanceof ApiError && save.error.isConflict;
  const errors = form.formState.errors;
  const managers = (agents.data ?? []).filter((a) => a.id !== agent?.id && a.status !== "archived");
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={agent ? `Edit ${agent.name}` : "New agent"}
      description="An agent is a role in your organization, backed by a model you choose."
      footer={<>
        <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" form="agent-form" loading={save.isPending}>{agent ? "Save" : "Create agent"}</Button>
      </>}>
      {conflict && <p role="alert" className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">This agent changed since you opened the form. Close it and reopen to edit the latest version.</p>}
      <form id="agent-form" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="a-name" error={errors.name?.message} required><Input id="a-name" aria-invalid={!!errors.name} {...form.register("name")} /></Field>
        <Field label="Role" htmlFor="a-role" error={errors.role?.message} required><Input id="a-role" placeholder="Sales, Accounting…" aria-invalid={!!errors.role} {...form.register("role")} /></Field>
        <Field label="Reports to" htmlFor="a-manager">
          <Select id="a-manager" {...form.register("manager_id")}>
            <option value="">Nobody (top of the organization)</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
          </Select>
        </Field>
        <Field label="Monthly budget" htmlFor="a-budget" error={errors.monthly_budget?.message} hint="0 = no agent-level limit"><Input id="a-budget" inputMode="decimal" {...form.register("monthly_budget")} /></Field>
        <Field label="Provider" htmlFor="a-provider" hint={provider && !connections.data?.find((c) => c.provider === provider && c.configured) ? "No connection yet: add it in Connections." : undefined}>
          <Select id="a-provider" {...form.register("provider")}>
            <option value="">None (submit results through the API)</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="ollama">Ollama (local)</option>
          </Select>
        </Field>
        <Field label="Model" htmlFor="a-model" error={errors.model?.message} hint={models.length ? `${models.length} models found by the last connection test` : "Exact model id from your provider"}>
          <Input id="a-model" list="a-models" disabled={!provider} {...form.register("model")} />
          <datalist id="a-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">Task types this agent may do</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {(contracts.data ?? []).map((c) => (
              <Checkbox key={c.id} value={c.id} label={taskTypeLabel(c.id)} description={`${c.risk} risk · ${c.cap === "supervised" ? "always supervised" : `up to ${c.cap}`}`} {...form.register("task_types")} />
            ))}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">Permissions (least privilege)</legend>
          {PERMISSIONS.map((p) => <Checkbox key={p.id} value={p.id} label={p.label} description={p.description} {...form.register("permissions")} />)}
        </fieldset>
        <div className="sm:col-span-2"><Field label="Description" htmlFor="a-desc"><Textarea id="a-desc" className="min-h-14" {...form.register("description")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Objectives" htmlFor="a-obj"><Textarea id="a-obj" className="min-h-14" {...form.register("objectives")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Instructions" htmlFor="a-instr" hint="Added to the agent's prompt. Select's safety rules always come first and cannot be overridden here."><Textarea id="a-instr" className="min-h-24" {...form.register("instructions")} /></Field></div>
      </form>
    </Dialog>
  );
}
