"use client";

import { Archive, Ban, Flag, Loader2, Play, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { ActivityTimeline, AgentAvatar, ApprovalCard, PriorityIcon, TaskStatusBadge, VerificationReceipt } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { TabPanel, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, DemoTag, Field, Select, Textarea } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/api";
import { formatDate, relative, taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useCompany, useContracts, useTask } from "@/lib/queries";
import type { Task, TaskDetail } from "@/lib/types";

function SubmitDialog({ cid, task, open, onOpenChange }: { cid: string; task: TaskDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState(() => JSON.stringify(task.result ?? {}, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const submit = useAction(cid, (output: Record<string, unknown>) =>
    api<TaskDetail & { outcome: string }>(`/companies/${cid}/tasks/${task.id}/submit`, { method: "POST", body: { output, idempotency_key: crypto.randomUUID() } }), {
    success: (r) => `Verified by the contract: ${r.outcome.replaceAll("_", " ")}`,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Submit an output"
      description="For agents that run elsewhere (or a human acting as the agent). The output is verified exactly like a live run."
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" loading={submit.isPending} onClick={() => {
          try {
            const parsed = JSON.parse(text) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The output must be a JSON object.");
            setParseError(null);
            submit.mutate(parsed as Record<string, unknown>);
          } catch (e) {
            setParseError(e instanceof Error ? e.message : "Invalid JSON");
          }
        }}>Submit for verification</Button>
      </>}>
      <Field label="Output (JSON)" htmlFor="output" error={parseError ?? undefined} hint={`Contract: ${task.task_type}. Values taken from a source carry {"value", "source_ref"}.`}>
        <Textarea id="output" value={text} onChange={(e) => setText(e.target.value)} className="min-h-72 bg-canvas font-mono text-xs" aria-invalid={!!parseError} spellCheck={false} />
      </Field>
    </Dialog>
  );
}

function Properties({ cid, task, canWrite }: { cid: string; task: TaskDetail; canWrite: boolean }) {
  const agents = useAgents(cid);
  const contracts = useContracts(cid);
  const eligible = (agents.data ?? []).filter((a) => a.task_types.includes(task.task_type) && a.status !== "archived");
  const contract = contracts.data?.find((c) => c.id === task.task_type);
  const patch = useAction(cid, (body: Partial<Task> & { clear_assignee?: boolean }) =>
    api<TaskDetail>(`/companies/${cid}/tasks/${task.id}`, { method: "PATCH", body: { version: task.version, ...body } }), {
    success: "Task updated",
  });
  const conflict = patch.error instanceof ApiError && patch.error.isConflict;
  const locked = !canWrite || task.is_demo || ["awaiting_approval", "done", "cancelled"].includes(task.status);
  return (
    <Card>
      <CardHeader title="Properties" />
      <div className="space-y-4 p-4">
        {conflict && <p role="alert" className="rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-xs text-warning">Someone changed this task meanwhile. The page now shows their version.</p>}
        <Field label="Assignee" htmlFor="d-assignee">
          <Select id="d-assignee" value={task.assignee_id ?? ""} disabled={locked || patch.isPending}
            onChange={(e) => patch.mutate(e.target.value ? { assignee_id: e.target.value } : { clear_assignee: true })}>
            <option value="">Unassigned</option>
            {eligible.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="d-priority">
          <Select id="d-priority" value={task.priority} disabled={locked || patch.isPending} onChange={(e) => patch.mutate({ priority: e.target.value as Task["priority"] })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </Select>
        </Field>
        <dl className="space-y-2 border-t border-line-soft pt-3 text-xs">
          {[
            ["Type", taskTypeLabel(task.task_type)],
            ["Contract", contract ? `${contract.id} v${contract.version} · ${contract.risk} risk` : "—"],
            ["Attempts", String(task.attempts)],
            ["Due", task.due_date ? formatDate(task.due_date) : "—"],
            ["Created", `${formatDate(task.created_at)} by ${task.is_demo ? "demo" : "you"}`],
            ["Updated", relative(task.updated_at)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-faint">{k}</dt><dd className="truncate text-right text-muted">{v}</dd></div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

const LABEL = "mb-1.5 text-2xs font-medium tracking-wide text-faint uppercase";

export default function TaskPage({ params }: { params: Promise<{ cid: string; tid: string }> }) {
  const { cid, tid } = use(params);
  const company = useCompany(cid);
  const task = useTask(cid, tid);
  const agents = useAgents(cid);
  const [tab, setTab] = useState("result");
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [problem, setProblem] = useState("");
  const run = useAction(cid, () => api(`/companies/${cid}/tasks/${tid}/run`, { method: "POST" }), { success: "Run queued" });
  const cancel = useAction(cid, () => api(`/companies/${cid}/tasks/${tid}/cancel`, { method: "POST", body: { note: "" } }), { success: "Task cancelled" });
  const archive = useAction(cid, () => api(`/companies/${cid}/tasks/${tid}/archive`, { method: "POST" }), { success: "Task archived" });
  const addComment = useAction(cid, (body: string) => api(`/companies/${cid}/tasks/${tid}/comments`, { method: "POST", body: { body } }), { onSuccess: () => setComment("") });
  const report = useAction(cid, (note: string) => api(`/companies/${cid}/tasks/${tid}/report-problem`, { method: "POST", body: { note } }), { success: "Problem recorded; the agent is supervised again" });
  const decide = useAction(cid, (v: { id: string; decision: string; note: string }) =>
    api(`/companies/${cid}/approvals/${v.id}/decide`, { method: "POST", body: { decision: v.decision, note: v.note } }), { success: "Decision recorded" });

  if (task.isPending) return <LoadingRows rows={10} />;
  if (task.isError) return <ErrorState error={task.error} retry={() => void task.refetch()} />;
  const t = task.data;
  const canWrite = company.data?.role !== "viewer";
  const agent = agents.data?.find((a) => a.id === t.assignee_id);
  const open = !["done", "cancelled"].includes(t.status);
  const lastReceipt = t.receipts.at(-1);
  const pending = t.approvals.find((a) => a.status === "pending");

  return (
    <>
      <PageHeader
        title={t.title}
        meta={<>
          <span className="font-mono text-xs text-faint">{t.key}</span>
          <TaskStatusBadge status={t.status} />
          {t.is_demo && <DemoTag />}
          {t.run_pending && <Badge tone="accent"><Loader2 className="size-3 animate-spin" aria-hidden />Run in progress</Badge>}
        </>}
        actions={canWrite && !t.is_demo ? <>
          {open && t.status !== "awaiting_approval" && (
            <Button size="sm" icon={<Send className="size-3.5" aria-hidden />} onClick={() => setSubmitting(true)}>Submit output</Button>
          )}
          {open && t.status !== "awaiting_approval" && agent && (
            <Button size="sm" variant="primary" icon={<Play className="size-3.5" aria-hidden />} loading={run.isPending || t.run_pending}
              disabled={!agent.connected} title={agent.connected ? undefined : "This agent has no working provider connection"} onClick={() => run.mutate(undefined)}>
              Run with {agent.name}
            </Button>
          )}
          {open && (
            <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<Ban className="size-3.5" aria-hidden />}>Cancel</Button>}
              title={`Cancel ${t.key}?`} description="Queued runs are dropped and any pending approval is withdrawn." confirmLabel="Cancel task"
              onConfirm={() => cancel.mutateAsync(undefined)} />
          )}
          {!open && !t.archived && (
            <Button size="sm" variant="ghost" icon={<Archive className="size-3.5" aria-hidden />} loading={archive.isPending} onClick={() => archive.mutate(undefined)}>Archive</Button>
          )}
        </> : undefined}
      />
      <PageBody className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:space-y-0">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
            {t.assignee_name ? (
              <Link href={`/c/${cid}/agents/${t.assignee_id}`} className="inline-flex items-center gap-2 rounded-md hover:text-fg">
                <AgentAvatar name={t.assignee_name} size="sm" />{t.assignee_name}
              </Link>
            ) : <span className="text-faint">Unassigned</span>}
            <span className="inline-flex items-center gap-1.5"><PriorityIcon priority={t.priority} /><span className="capitalize">{t.priority}</span></span>
            <span>{taskTypeLabel(t.task_type)}</span>
            <span className="text-faint">updated {relative(t.updated_at)}</span>
          </div>
          {pending && (
            <ApprovalCard approval={pending} busy={decide.isPending} onDecide={(decision, note) => decide.mutate({ id: pending.id, decision, note })} />
          )}
          <Card>
            <Tabs value={tab} onValueChange={setTab} label="Task sections" tabs={[
              { value: "result", label: "Result" },
              { value: "verification", label: "Verification", count: t.receipts.length },
              { value: "runs", label: "Runs", count: t.runs.length },
              { value: "comments", label: "Comments", count: t.comments.length },
              { value: "history", label: "History", count: t.history.length },
            ]}>
              <TabPanel value="result" className="space-y-5 p-4">
                {t.description && <p className="text-[13px] whitespace-pre-wrap text-muted">{t.description}</p>}
                {(t.inputs.sources ?? []).map((s) => (
                  <div key={s.id}>
                    <p className={LABEL}>
                      <ShieldAlert className="mr-1 inline size-3 align-[-2px]" aria-hidden />
                      Source {s.id} · untrusted input, quoted never obeyed
                    </p>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-line-soft bg-canvas p-3 font-mono text-xs whitespace-pre-wrap text-muted">{s.text}</pre>
                  </div>
                ))}
                <div>
                  <p className={LABEL}>Latest result</p>
                  {t.result ? (
                    <pre className="max-h-96 overflow-auto rounded-lg border border-line-soft bg-canvas p-3 font-mono text-xs text-fg">{JSON.stringify(t.result, null, 2)}</pre>
                  ) : (
                    <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-[13px] text-muted">No result yet. {agent?.connected ? "Run it with the assigned agent" : "Submit an output from your agent runtime"}, or assign an agent first.</p>
                  )}
                </div>
                {t.status === "done" && canWrite && (
                  <div className="rounded-xl border border-line-soft bg-canvas/40 p-3.5">
                    <label htmlFor="problem" className="text-xs text-muted">Found a problem after the fact? Reporting it counts as an undetected error and removes the agent&apos;s autonomy on this task type.</label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Textarea id="problem" value={problem} onChange={(e) => setProblem(e.target.value)} className="min-h-10" placeholder="What was wrong?" />
                      <Button variant="danger" size="sm" icon={<Flag className="size-3.5" aria-hidden />} disabled={!problem.trim()} loading={report.isPending} onClick={() => report.mutate(problem.trim())}>Report</Button>
                    </div>
                  </div>
                )}
              </TabPanel>
              <TabPanel value="verification" className="space-y-3 p-4">
                {t.receipts.length === 0 ? <EmptyState compact title="No receipt yet" description="Each result gets a receipt listing every check the system ran." /> :
                  [...t.receipts].reverse().map((r) => <VerificationReceipt key={r.id} receipt={r} />)}
              </TabPanel>
              <TabPanel value="runs" className="divide-y divide-line-soft">
                {t.runs.length === 0 ? <EmptyState compact title="No run yet" /> : t.runs.map((r) => (
                  <div key={r.id} className="px-4 py-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Attempt {r.attempt}</span>
                      <Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "accent"}>{r.status}</Badge>
                      <Badge>{r.mode}</Badge>
                      {r.provider && <span className="font-mono text-xs text-muted">{r.provider} · {r.model}</span>}
                      {r.input_tokens > 0 && <span className="text-xs text-faint tabular">{r.input_tokens} in · {r.output_tokens} out tokens</span>}
                      <span className="ml-auto text-xs text-faint">{formatDate(r.started_at)}</span>
                    </div>
                    {r.error && <p className="mt-1.5 text-xs text-danger">{r.error}</p>}
                    {r.log.map((l, i) => <p key={i} className="mt-1 font-mono text-2xs text-muted">[{l.level}] {l.message}</p>)}
                  </div>
                ))}
              </TabPanel>
              <TabPanel value="comments" className="p-4">
                <ul className="space-y-3">
                  {t.comments.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <AgentAvatar name={c.author_name} size="sm" />
                      <div className="min-w-0 flex-1 rounded-xl border border-line-soft bg-canvas/40 px-3 py-2">
                        <p className="text-xs text-faint"><span className="text-muted">{c.author_name}</span> · {relative(c.created_at)}</p>
                        <p className="mt-1 text-[13px] whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </li>
                  ))}
                  {t.comments.length === 0 && <li className="text-[13px] text-muted">No comment yet.</li>}
                </ul>
                {canWrite && (
                  <form className="mt-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate(comment.trim()); }}>
                    <label htmlFor="comment" className="sr-only">Add a comment</label>
                    <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note for the team or the agent's next attempt" className="min-h-16" />
                    <Button type="submit" size="sm" className="self-end" loading={addComment.isPending} disabled={!comment.trim()}>Comment</Button>
                  </form>
                )}
              </TabPanel>
              <TabPanel value="history"><ActivityTimeline events={t.history} dense /></TabPanel>
            </Tabs>
          </Card>
        </div>
        <div className="space-y-4">
          <Properties cid={cid} task={t} canWrite={canWrite} />
          {lastReceipt && (
            <Card>
              <CardHeader title="Latest verification" />
              <div className="p-3"><VerificationReceipt receipt={lastReceipt} /></div>
            </Card>
          )}
        </div>
      </PageBody>
      {submitting && <SubmitDialog cid={cid} task={t} open={submitting} onOpenChange={setSubmitting} />}
    </>
  );
}
