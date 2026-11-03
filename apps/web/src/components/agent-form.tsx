"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Cloud, Cpu, Server, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Dialog } from "./ui/overlay";
import { Button, Checkbox, Field, Input, Select, StatusDot, Textarea, cx } from "./ui/primitives";
import { ApiError, api } from "@/lib/api";
import { taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useConnections, useContracts } from "@/lib/queries";
import type { Agent } from "@/lib/types";

const PERMISSIONS = [
  { id: "read_messages", label: "Read incoming messages", description: "Sees the source material attached to its tasks." },
  { id: "read_catalog", label: "Read the catalog", description: "Can reference catalog items and prices." },
  { id: "draft_external", label: "Draft external messages", description: "May prepare e-mails or posts. Sending always goes through Select's rules." },
] as const;

const PROVIDERS = [
  { id: "", label: "None", hint: "Results arrive through the API", icon: Terminal },
  { id: "anthropic", label: "Anthropic", hint: "Claude models", icon: Cloud },
  { id: "openai", label: "OpenAI", hint: "GPT models", icon: Cloud },
  { id: "gemini", label: "Gemini", hint: "Google models", icon: Cloud },
  { id: "ollama", label: "Ollama", hint: "Local models", icon: Server },
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

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line-soft pt-4 first:border-0 first:pt-0 sm:grid-cols-[160px_1fr]">
      <div>
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-faint">{description}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

export function AgentFormDialog({ cid, agent, open, onOpenChange, onSaved, defaultManagerId }: {
  cid: string;
  agent?: Agent;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (a: Agent) => void;
  defaultManagerId?: string;
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
      manager_id: agent?.manager_id ?? defaultManagerId ?? "",
      provider: agent?.provider ?? "",
      model: agent?.model ?? "",
      task_types: agent?.task_types ?? [],
      permissions: agent?.permissions ?? ["read_messages"],
      monthly_budget: agent?.monthly_budget ?? "0",
    },
  });
  const provider = useWatch({ control: form.control, name: "provider" });
  const connection = connections.data?.find((c) => c.provider === provider);
  const models = connection?.models ?? [];
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
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="agent-form" loading={save.isPending}>{agent ? "Save" : "Create agent"}</Button>
      </>}>
      {conflict && <p role="alert" className="mb-3 rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-xs text-warning">This agent changed since you opened the form. Close it and reopen to edit the latest version.</p>}
      <form id="agent-form" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-5">
        <Section title="Identity" description="How the team will see this post">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="a-name" error={errors.name?.message} required><Input id="a-name" aria-invalid={!!errors.name} {...form.register("name")} /></Field>
            <Field label="Role" htmlFor="a-role" error={errors.role?.message} required><Input id="a-role" placeholder="Sales, Accounting…" aria-invalid={!!errors.role} {...form.register("role")} /></Field>
            <Field label="Reports to" htmlFor="a-manager">
              <Select id="a-manager" {...form.register("manager_id")}>
                <option value="">Nobody (top of the organization)</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
              </Select>
            </Field>
            <Field label="Monthly budget" htmlFor="a-budget" error={errors.monthly_budget?.message} hint="0 = no agent-level limit"><Input id="a-budget" inputMode="decimal" {...form.register("monthly_budget")} /></Field>
          </div>
        </Section>

        <Section title="Model" description="Who does the thinking. You can change it at any time.">
          <fieldset>
            <legend className="sr-only">Provider</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROVIDERS.map((p) => {
                const conn = connections.data?.find((c) => c.provider === p.id);
                const ready = p.id === "" || (conn?.configured && conn.enabled !== false);
                return (
                  <label
                    key={p.id || "none"}
                    className={cx(
                      "relative flex min-h-[58px] cursor-pointer flex-col justify-center rounded-lg border border-line bg-surface-2 px-3 py-2 transition-colors duration-[120ms]",
                      "hover:border-line-strong has-[:checked]:border-accent/70 has-[:checked]:bg-selected has-[:focus-visible]:shadow-[0_0_0_3px_rgb(165_180_200/0.18)]",
                    )}
                  >
                    <input type="radio" value={p.id} className="sr-only" {...form.register("provider")} />
                    <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                      <p.icon className="size-3.5 text-faint" aria-hidden />
                      {p.label}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                      {p.id !== "" && <StatusDot tone={ready ? "success" : "neutral"} />}
                      {p.id === "" ? p.hint : ready ? "Connected" : "Not connected"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {provider && !connection?.configured && (
            <p className="flex items-center gap-1.5 text-xs text-warning"><Cpu className="size-3.5" aria-hidden />No {provider} connection yet: the agent stays &ldquo;not connected&rdquo; until you add it in Connections.</p>
          )}
          <Field label="Model" htmlFor="a-model" error={errors.model?.message} hint={!provider ? "Pick a provider first, or leave None to submit results yourself" : models.length ? `${models.length} models found by the last connection test` : "Exact model id from your provider"}>
            <Input id="a-model" list="a-models" disabled={!provider} placeholder={provider ? "e.g. the model id from your provider" : undefined} {...form.register("model")} />
            <datalist id="a-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
        </Section>

        <Section title="Work" description="Each task type has a contract; risk caps its autonomy.">
          <fieldset>
            <legend className="sr-only">Task types this agent may do</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {(contracts.data ?? []).map((c) => (
                <Checkbox key={c.id} value={c.id} label={taskTypeLabel(c.id)} description={`${c.risk} risk · ${c.cap === "supervised" ? "always supervised" : `up to ${c.cap}`}`} {...form.register("task_types")} />
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="Permissions" description="Least privilege. Sending, paying or signing is never a permission.">
          {PERMISSIONS.map((p) => <Checkbox key={p.id} value={p.id} label={p.label} description={p.description} {...form.register("permissions")} />)}
        </Section>

        <Section title="Brief" description="Context for the model">
          <Field label="Description" htmlFor="a-desc"><Textarea id="a-desc" className="min-h-14" {...form.register("description")} /></Field>
          <Field label="Objectives" htmlFor="a-obj"><Textarea id="a-obj" className="min-h-14" {...form.register("objectives")} /></Field>
          <Field label="Instructions" htmlFor="a-instr" hint="Added to the agent's prompt. Select's safety rules always come first and cannot be overridden here."><Textarea id="a-instr" className="min-h-24" {...form.register("instructions")} /></Field>
        </Section>
      </form>
    </Dialog>
  );
}
