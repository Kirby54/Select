"use client";

import { CalendarClock, MoreHorizontal, Play, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AgentAvatar } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog, Dropdown } from "@/components/ui/overlay";
import { Badge, Button, Card, Field, IconButton, Input, Segmented, Select, Switch, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDateIn, relative, taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useCompany, useCompanyId, useContracts, useRoutines } from "@/lib/queries";
import { DAYS, describeCron, fromCron, toCron, type Schedule } from "@/lib/schedule";
import type { Priority, Routine } from "@/lib/types";

function RoutineDialog({ cid, routine, open, onOpenChange }: { cid: string; routine?: Routine; open: boolean; onOpenChange: (o: boolean) => void }) {
  const company = useCompany(cid);
  const contracts = useContracts(cid);
  const agents = useAgents(cid);
  const [name, setName] = useState(routine?.name ?? "");
  const [schedule, setSchedule] = useState<Schedule>(() => (routine ? fromCron(routine.cron) : { frequency: "weekly", time: "09:00", weekday: "1", monthday: "1", cron: "0 9 * * 1" }));
  const [title, setTitle] = useState(routine?.title ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [type, setType] = useState(routine?.task_type ?? "general_task");
  const [agentId, setAgentId] = useState(routine?.assignee_id ?? "");
  const [priority, setPriority] = useState<Priority>(routine?.priority ?? "medium");
  const [preview, setPreview] = useState<{ valid: boolean; errors: string[]; upcoming: string[] } | null>(null);
  const cron = toCron(schedule);
  const allowed = (agents.data ?? []).filter((a) => a.status === "active" && a.task_types.includes(type));

  useEffect(() => {
    if (!open || cron.split(/\s+/).length !== 5) return;
    const timer = window.setTimeout(() => {
      api<{ valid: boolean; errors: string[]; upcoming: string[] }>(`/companies/${cid}/routines/preview`, { method: "POST", body: { cron } })
        .then(setPreview)
        .catch(() => setPreview({ valid: false, errors: ["The schedule could not be checked."], upcoming: [] }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cid, cron, open]);

  const save = useAction(
    cid,
    (body: Record<string, unknown>) =>
      routine ? api(`/companies/${cid}/routines/${routine.id}`, { method: "PATCH", body }) : api(`/companies/${cid}/routines`, { method: "POST", body }),
    { success: routine ? "Routine saved" : "Routine created", onSuccess: () => onOpenChange(false) },
  );
  const submit = () => {
    const body: Record<string, unknown> = { name: name.trim(), cron, title: title.trim(), description, task_type: type, priority };
    if (routine) {
      if (agentId) body.assignee_id = agentId;
      else body.clear_assignee = true;
    } else if (agentId) body.assignee_id = agentId;
    save.mutate(body);
  };
  const valid = name.trim() && title.trim() && preview?.valid;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={routine ? `Edit ${routine.name}` : "New routine"}
      description={`A task is created on this schedule, in ${company.data?.timezone ?? "the company's time zone"}. If the agent can run, it starts at once.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={submit}>{routine ? "Save" : "Create routine"}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Name" htmlFor="r-name"><Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly summary" /></Field></div>
        <div className="space-y-3 rounded-xl border border-line-soft p-3.5 sm:col-span-2">
          <Segmented
            label="How often"
            value={schedule.frequency}
            onChange={(frequency) => setSchedule({ ...schedule, frequency, cron: frequency === "custom" ? cron : schedule.cron })}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekdays", label: "Weekdays" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "custom", label: "Cron" },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {schedule.frequency === "custom" ? (
              <div className="sm:col-span-3">
                <Field label="Cron expression" htmlFor="r-cron" hint="minute hour day-of-month month day-of-week — at most every 15 minutes">
                  <Input id="r-cron" value={schedule.cron} onChange={(e) => setSchedule({ ...schedule, cron: e.target.value })} className="font-mono" />
                </Field>
              </div>
            ) : (
              <>
                <Field label="Time" htmlFor="r-time"><Input id="r-time" type="time" value={schedule.time} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} /></Field>
                {schedule.frequency === "weekly" && (
                  <Field label="Day" htmlFor="r-day">
                    <Select id="r-day" value={schedule.weekday} onChange={(e) => setSchedule({ ...schedule, weekday: e.target.value })}>
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={String(d)}>{DAYS[d]}</option>)}
                    </Select>
                  </Field>
                )}
                {schedule.frequency === "monthly" && (
                  <Field label="Day of the month" htmlFor="r-dom">
                    <Select id="r-dom" value={schedule.monthday} onChange={(e) => setSchedule({ ...schedule, monthday: e.target.value })}>
                      {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => <option key={d} value={d}>{d}</option>)}
                    </Select>
                  </Field>
                )}
              </>
            )}
          </div>
          <p className={preview && !preview.valid ? "text-xs text-danger" : "text-xs text-muted"} role="status">
            {!preview ? "Checking the schedule…" : preview.valid ? `Next: ${preview.upcoming.map((d) => formatDateIn(d, company.data?.timezone)).join(" · ")}` : preview.errors.join(" ")}
          </p>
        </div>
        <div className="sm:col-span-2"><Field label="Task title" htmlFor="r-title"><Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summarise last week's customer questions" /></Field></div>
        <div className="sm:col-span-2">
          <Field label="Instructions for the task" htmlFor="r-desc" hint="What the agent should produce each time.">
            <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
          </Field>
        </div>
        <Field label="Task type" htmlFor="r-type">
          <Select id="r-type" value={type} onChange={(e) => { setType(e.target.value); setAgentId(""); }}>
            {(contracts.data ?? []).filter((c) => !["message_triage", "payment_request"].includes(c.id)).map((c) => <option key={c.id} value={c.id}>{taskTypeLabel(c.id)}</option>)}
          </Select>
        </Field>
        <Field label="Agent" htmlFor="r-agent" hint={allowed.length ? undefined : "No active agent may do this task type: tasks wait unassigned."}>
          <Select id="r-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">Unassigned</option>
            {allowed.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="r-prio">
          <Select id="r-prio" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function RoutineRow({ cid, r, canAdmin, canRun, onEdit }: { cid: string; r: Routine; canAdmin: boolean; canRun: boolean; onEdit: () => void }) {
  const router = useRouter();
  const toggle = useAction(cid, (enabled: boolean) => api(`/companies/${cid}/routines/${r.id}`, { method: "PATCH", body: { enabled } }), { success: (x: unknown) => ((x as Routine).enabled ? "Routine on" : "Routine off") });
  const run = useAction(cid, () => api<{ key: string }>(`/companies/${cid}/routines/${r.id}/run`, { method: "POST" }), { success: (t) => `${t.key} created` });
  const remove = useAction(cid, () => api(`/companies/${cid}/routines/${r.id}`, { method: "DELETE" }), { success: "Routine deleted" });
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-hidden><CalendarClock className="size-4" /></span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg">{r.name}{!r.enabled && <Badge>Off</Badge>}</p>
          <p className="mt-0.5 text-xs text-muted">{describeCron(r.cron)} · {r.timezone}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            <span>{taskTypeLabel(r.task_type)}: “{r.title}”</span>
            {r.assignee_name ? <span className="inline-flex items-center gap-1.5"><AgentAvatar name={r.assignee_name} size="sm" />{r.assignee_name}</span> : <span>Unassigned</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 sm:justify-end">
        <div className="text-right text-xs">
          <p className="text-muted">{r.enabled && r.upcoming[0] ? <>Next <span className="text-fg" title={relative(r.upcoming[0])}>{formatDateIn(r.upcoming[0], r.timezone)}</span></> : "Not scheduled"}</p>
          <p className="text-faint">{r.runs_count ? `${r.runs_count} run${r.runs_count > 1 ? "s" : ""}, last ${relative(r.last_run_at)}` : "Never ran"}</p>
        </div>
        {canAdmin && <Switch checked={r.enabled} onCheckedChange={(v) => toggle.mutate(v)} label={`${r.name} on or off`} disabled={toggle.isPending} />}
        {(canAdmin || canRun) && (
          <Dropdown
            label={`Actions for ${r.name}`}
            trigger={<IconButton label={`Actions for ${r.name}`}><MoreHorizontal className="size-4" aria-hidden /></IconButton>}
            items={[
              ...(canRun ? [{ label: "Run now", icon: <Play aria-hidden />, onSelect: () => run.mutate(undefined) }] : []),
              ...(canAdmin ? [{ label: "Edit", onSelect: onEdit }, "separator" as const] : []),
              ...(r.last_task_id ? [{ label: "Open the last task", onSelect: () => router.push(`/c/${cid}/tasks/${r.last_task_id}`) }] : []),
            ]}
          />
        )}
        {canAdmin && (
          <ConfirmDialog
            trigger={<Button size="sm" variant="ghost" className="text-danger hover:text-danger">Delete</Button>}
            title={`Delete ${r.name}?`}
            description="Tasks it already created stay. No new task is created on this schedule."
            confirmLabel="Delete"
            onConfirm={() => remove.mutateAsync(undefined)}
          />
        )}
      </div>
    </li>
  );
}

function RoutinesInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const routines = useRoutines(cid);
  const params = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<Routine | null>(null);
  const [creatingLocal, setCreatingLocal] = useState(false);
  const creating = creatingLocal || params.get("new") === "1";
  const closeCreate = () => { setCreatingLocal(false); if (params.get("new")) router.replace(`/c/${cid}/routines`, { scroll: false }); };
  const role = company.data?.role;
  const canAdmin = role === "owner" || role === "admin";
  const canRun = !!role && role !== "viewer";
  const demo = company.data?.is_demo;
  return (
    <>
      <PageHeader
        title="Routines"
        description="Work created on a schedule: reports, follow-ups, weekly posts"
        actions={canAdmin && !demo ? <Button variant="primary" size="sm" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setCreatingLocal(true)}>New routine</Button> : undefined}
      />
      <PageBody className="max-w-5xl">
        {demo && <p className="text-[13px] text-muted">The demo company replays a recorded week and has no routines.</p>}
        {routines.isPending ? (
          <Card><LoadingRows /></Card>
        ) : routines.isError ? (
          <Card><ErrorState error={routines.error} retry={() => void routines.refetch()} /></Card>
        ) : routines.data.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarClock />}
              title="No routine yet"
              description="A routine creates the same task on a schedule, for example a summary every Monday at 8:30. Each result is verified and approved like any other."
              action={canAdmin && !demo ? <Button variant="primary" size="sm" onClick={() => setCreatingLocal(true)}>New routine</Button> : undefined}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {routines.data.map((r) => <RoutineRow key={r.id} cid={cid} r={r} canAdmin={canAdmin} canRun={canRun} onEdit={() => setEditing(r)} />)}
            </ul>
          </Card>
        )}
        <p className="text-xs text-faint">A run missed while Select was stopped happens once when it restarts. Nothing runs during an emergency stop.</p>
      </PageBody>
      {creating && <RoutineDialog cid={cid} open={creating} onOpenChange={(o) => { if (!o) closeCreate(); }} />}
      {editing && <RoutineDialog key={editing.id} cid={cid} routine={editing} open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} />}
    </>
  );
}

export default function RoutinesPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <RoutinesInner />
    </Suspense>
  );
}
