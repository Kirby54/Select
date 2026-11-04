"use client";

import { AlertTriangle, Mail, MailPlus, Paperclip, Plug, RefreshCw, Search, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ReactNode } from "react";

import { TaskStatusBadge } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog, DetailPanel, Dialog } from "@/components/ui/overlay";
import { Badge, Button, Card, Field, Input, Select, Segmented, cx, type Tone } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDate, relative, taskTypeLabel } from "@/lib/format";
import { useIsDesktop } from "@/lib/hooks";
import { useAction, useAgents, useCompany, useCompanyId, useContracts, useDeliveries, useMailboxes, useMessage, useMessages } from "@/lib/queries";
import type { Delivery, DeliveryStatus, MailMessage, MessageStatus } from "@/lib/types";

const MESSAGE_STATUS: Record<MessageStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "accent" },
  triage: { label: "Being triaged", tone: "sampled" },
  routed: { label: "Assigned", tone: "sampled" },
  needs_human: { label: "Needs a person", tone: "supervised" },
  handled: { label: "Handled", tone: "success" },
  ignored: { label: "Ignored", tone: "neutral" },
  failed: { label: "Unreadable", tone: "danger" },
};

const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  ready: { label: "Ready, no mailbox", tone: "warning" },
  held: { label: "Held", tone: "warning" },
  queued: { label: "Queued", tone: "sampled" },
  sending: { label: "Sending", tone: "sampled" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  uncertain: { label: "Uncertain", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function Sender({ m }: { m: MailMessage }) {
  return <>{m.from_name || m.from_address || "Unknown sender"}</>;
}

function MessageRow({ m, selected, onSelect }: { m: MailMessage; selected: boolean; onSelect: () => void }) {
  const status = MESSAGE_STATUS[m.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cx("flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors duration-[120ms]", selected ? "bg-selected shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-hover")}
    >
      <span className="flex items-center gap-2">
        <span className={cx("truncate text-[13px]", m.status === "needs_human" ? "font-semibold text-fg" : "font-medium text-fg")}><Sender m={m} /></span>
        <span className="ml-auto shrink-0 text-xs text-faint">{relative(m.received_at)}</span>
      </span>
      <span className="truncate text-[13px] text-muted">{m.subject || "(no subject)"}</span>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{m.snippet}</span>
        {m.attachments.length > 0 && <Paperclip className="size-3 shrink-0 text-faint" aria-label="Has attachments" />}
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
    </button>
  );
}

function TaskFromMessage({ cid, message, onDone }: { cid: string; message: MailMessage; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const contracts = useContracts(cid);
  const agents = useAgents(cid);
  const [type, setType] = useState("support_reply");
  const [agentId, setAgentId] = useState("");
  const allowed = (agents.data ?? []).filter((a) => a.status === "active" && a.task_types.includes(type));
  const create = useAction(cid, (body: Record<string, unknown>) => api(`/companies/${cid}/messages/${message.id}/task`, { method: "POST", body }), {
    success: "Task created from the e-mail",
    onSuccess: () => { setOpen(false); onDone(); },
  });
  return (
    <>
      <Button size="sm" variant="primary" icon={<MailPlus className="size-3.5" aria-hidden />} onClick={() => setOpen(true)}>Create a task</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create a task from this e-mail"
        description="The e-mail becomes the task's source: the agent reads it as data, and every value it uses must come from it."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={() => create.mutate({ task_type: type, assignee_id: agentId || null })}>Create task</Button></>}
      >
        <div className="space-y-4">
          <Field label="Task type" htmlFor="m-type">
            <Select id="m-type" value={type} onChange={(e) => { setType(e.target.value); setAgentId(""); }}>
              {(contracts.data ?? []).filter((c) => c.id !== "message_triage").map((c) => <option key={c.id} value={c.id}>{taskTypeLabel(c.id)}</option>)}
            </Select>
          </Field>
          <Field label="Agent" htmlFor="m-agent" hint={allowed.length ? undefined : "No active agent may do this task type yet; the task waits unassigned."}>
            <Select id="m-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Unassigned</option>
              {allowed.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  );
}

function MessageDetailView({ cid, id, canWrite }: { cid: string; id: string; canWrite: boolean }) {
  const detail = useMessage(cid, id);
  const ignore = useAction(cid, () => api(`/companies/${cid}/messages/${id}/ignore`, { method: "POST", body: { note: "" } }), { success: "E-mail ignored" });
  const handled = useAction(cid, () => api(`/companies/${cid}/messages/${id}/handled`, { method: "POST", body: { note: "" } }), { success: "Marked as handled" });
  if (detail.isPending) return <LoadingRows rows={6} />;
  if (detail.isError) return <ErrorState error={detail.error} retry={() => void detail.refetch()} compact />;
  const m = detail.data;
  const status = MESSAGE_STATUS[m.status];
  const open = !["handled", "ignored"].includes(m.status);
  return (
    <article className="space-y-4" aria-label={`E-mail from ${m.from_address}`}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {m.automatic && <Badge>Automatic message</Badge>}
          {m.mailbox && <span className="text-xs text-faint">to {m.mailbox}</span>}
        </div>
        <h2 className="text-[15px] font-semibold text-fg">{m.subject || "(no subject)"}</h2>
        <dl className="grid grid-cols-[64px_1fr] gap-y-0.5 text-xs">
          <dt className="text-faint">From</dt><dd className="text-muted">{m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address}</dd>
          {m.reply_to && <><dt className="text-faint">Reply to</dt><dd className="text-muted">{m.reply_to}</dd></>}
          <dt className="text-faint">To</dt><dd className="truncate text-muted">{m.to || "—"}</dd>
          <dt className="text-faint">Received</dt><dd className="text-muted">{formatDate(m.received_at)}</dd>
        </dl>
        {m.status_note && <p className="rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-xs text-muted">{m.status_note}</p>}
      </header>

      {canWrite && open && (
        <div className="flex flex-wrap gap-2">
          <TaskFromMessage cid={cid} message={m} onDone={() => void detail.refetch()} />
          <Button size="sm" loading={handled.isPending} onClick={() => handled.mutate(undefined)}>Mark handled</Button>
          <Button size="sm" variant="ghost" loading={ignore.isPending} onClick={() => ignore.mutate(undefined)}>Ignore</Button>
        </div>
      )}

      <section aria-label="Message text">
        <pre className="max-h-[420px] overflow-auto rounded-lg border border-line-soft bg-canvas px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-fg">{m.text || "(empty message)"}</pre>
        {m.attachments.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {m.attachments.map((a) => (
              <li key={`${a.filename}-${a.size}`} className="flex items-center gap-1.5"><Paperclip className="size-3 text-faint" aria-hidden />{a.filename} <span className="text-faint">· {Math.ceil(a.size / 1024)} KB · not read by Select</span></li>
            ))}
          </ul>
        )}
      </section>

      {m.tasks.length > 0 && (
        <section aria-label="Tasks from this e-mail" className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted">Tasks</h3>
          <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {m.tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/c/${cid}/tasks/${t.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-hover">
                  <span className="font-mono text-xs text-faint">{t.key}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{t.title}</span>
                  <span className="hidden text-xs text-faint sm:inline">{t.assignee_name ?? "Unassigned"}</span>
                  <TaskStatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {m.deliveries.length > 0 && (
        <section aria-label="Replies" className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted">Replies</h3>
          <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {m.deliveries.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <Send className="size-3.5 text-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{d.subject}</span>
                <Badge tone={DELIVERY_STATUS[d.status].tone}>{DELIVERY_STATUS[d.status].label}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function DeliveryRow({ d, selected, onSelect }: { d: Delivery; selected: boolean; onSelect: () => void }) {
  const status = DELIVERY_STATUS[d.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cx("flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors duration-[120ms]", selected ? "bg-selected shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-hover")}
    >
      <span className="flex items-center gap-2">
        <span className="truncate text-[13px] font-medium text-fg">{d.to}</span>
        <span className="ml-auto shrink-0 text-xs text-faint">{relative(d.sent_at ?? d.updated_at)}</span>
      </span>
      <span className="truncate text-[13px] text-muted">{d.subject}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs text-faint">{d.task_key}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{d.approved_by.startsWith("autonomous") ? "No review: earned licence" : `Approved by ${d.approved_by}`}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
    </button>
  );
}

function DeliveryDetail({ cid, d, canWrite }: { cid: string; d: Delivery; canWrite: boolean }) {
  const send = useAction(cid, (confirm: boolean) => api(`/companies/${cid}/deliveries/${d.id}/send`, { method: "POST", body: { confirm_resend: confirm } }), { success: "Queued for sending" });
  const mark = useAction(cid, (status: "sent" | "cancelled") => api(`/companies/${cid}/deliveries/${d.id}/mark`, { method: "POST", body: { status, note: "" } }), { success: "Recorded" });
  const status = DELIVERY_STATUS[d.status];
  return (
    <article className="space-y-4" aria-label={`E-mail to ${d.to}`}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Link href={`/c/${cid}/tasks/${d.task_id}`} className="font-mono text-xs text-faint hover:text-fg">{d.task_key}</Link>
          {d.attempts > 0 && <span className="text-xs text-faint">{d.attempts} attempt{d.attempts > 1 ? "s" : ""}</span>}
        </div>
        <h2 className="text-[15px] font-semibold text-fg">{d.subject}</h2>
        <dl className="grid grid-cols-[72px_1fr] gap-y-0.5 text-xs">
          <dt className="text-faint">From</dt><dd className="text-muted">{d.mailbox ?? "no mailbox yet"}</dd>
          <dt className="text-faint">To</dt><dd className="text-muted">{d.to}</dd>
          <dt className="text-faint">Decided</dt><dd className="text-muted">{d.approved_by.startsWith("autonomous") ? `Without review, ${d.approved_by}` : `Approved by ${d.approved_by}`}</dd>
          {d.sent_at && <><dt className="text-faint">Sent</dt><dd className="text-muted">{formatDate(d.sent_at)}</dd></>}
          <dt className="text-faint">Message-ID</dt><dd className="truncate font-mono text-2xs text-faint">{d.message_id}</dd>
        </dl>
        {(d.status_note || d.last_error) && (
          <p className={cx("rounded-lg border px-3 py-2 text-xs", ["failed", "uncertain"].includes(d.status) ? "border-danger/30 bg-danger/8 text-danger" : "border-line-soft bg-surface-2 text-muted")}>
            {d.status_note}{d.last_error && d.status !== "sent" ? <span className="mt-1 block font-mono text-2xs">{d.last_error}</span> : null}
          </p>
        )}
      </header>
      {canWrite && ["ready", "held", "failed", "uncertain"].includes(d.status) && (
        <div className="flex flex-wrap gap-2">
          {d.status === "uncertain" ? (
            <>
              <Button size="sm" onClick={() => mark.mutate("sent")} loading={mark.isPending}>It was sent</Button>
              <ConfirmDialog
                trigger={<Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" aria-hidden />}>Send again</Button>}
                title="Send this e-mail again?"
                description="The connection broke while it was being handed over, so the customer may already have it. Check the Sent folder of the mailbox first."
                confirmLabel="Send again"
                onConfirm={() => send.mutateAsync(true)}
              />
            </>
          ) : (
            <Button size="sm" variant="primary" icon={<Send className="size-3.5" aria-hidden />} loading={send.isPending} onClick={() => send.mutate(false)}>Send now</Button>
          )}
          <Button size="sm" variant="ghost" loading={mark.isPending} onClick={() => mark.mutate("cancelled")}>Don&apos;t send</Button>
        </div>
      )}
      <pre className="max-h-[460px] overflow-auto rounded-lg border border-line-soft bg-canvas px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-fg">{d.body}</pre>
    </article>
  );
}

function TwoPane({ list, detail, open, onClose, title, desktop }: { list: ReactNode; detail: ReactNode; open: boolean; onClose: () => void; title: string; desktop: boolean }) {
  if (desktop) {
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {list}
        <Card className="min-w-0 p-4 sm:p-5">{detail}</Card>
      </div>
    );
  }
  return (
    <>
      {list}
      <DetailPanel open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={title} size="lg">
        <div className="p-4">{detail}</div>
      </DetailPanel>
    </>
  );
}

function MessagesInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const params = useSearchParams();
  const router = useRouter();
  const desktop = useIsDesktop();
  const view = params.get("view") === "outbox" ? "outbox" : "received";
  const [filter, setFilter] = useState<"open" | "needs_human" | "all" | "ignored">("open");
  const [q, setQ] = useState("");
  const messages = useMessages(cid, { status: filter === "all" ? undefined : filter, q: q.trim() || undefined });
  const deliveries = useDeliveries(cid);
  const mailboxes = useMailboxes(cid);
  const [selected, setSelected] = useState<string | null>(params.get("m"));
  const canWrite = !!company.data && company.data.role !== "viewer";
  const setView = (v: "received" | "outbox") => { setSelected(null); router.replace(`/c/${cid}/messages${v === "outbox" ? "?view=outbox" : ""}`, { scroll: false }); };

  const msgItems = useMemo(() => messages.data?.items ?? [], [messages.data]);
  const dItems = useMemo(() => deliveries.data?.items ?? [], [deliveries.data]);
  const currentMessage = msgItems.find((m) => m.id === selected) ?? (desktop && !selected ? msgItems[0] : undefined);
  const currentDelivery = dItems.find((d) => d.id === selected) ?? (desktop && !selected ? dItems[0] : undefined);
  const counts = messages.data?.counts ?? {};
  const attention = dItems.filter((d) => ["ready", "held", "failed", "uncertain"].includes(d.status)).length;
  const noMailbox = mailboxes.data && mailboxes.data.length === 0;

  return (
    <>
      <PageHeader
        title="Messages"
        description="E-mail received by the company's mailboxes and e-mail Select sent"
        actions={
          <Segmented
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: "received", label: <>Received{counts.needs_human ? <span className="tabular text-supervised">{counts.needs_human}</span> : null}</> },
              { value: "outbox", label: <>Sent{attention ? <span className="tabular text-warning">{attention}</span> : null}</> },
            ]}
          />
        }
      />
      <PageBody>
        {company.data?.is_demo && <p className="text-[13px] text-muted">The demo company has no mailbox: its week is recorded. Open your own company to read and send real e-mail.</p>}
        {noMailbox && !company.data?.is_demo && (
          <Card>
            <EmptyState
              icon={<Plug />}
              title="No mailbox connected"
              description="Connect the company mailbox: new e-mails become triage tasks, and approved replies leave from it."
              action={<Link href={`/c/${cid}/connections?mailbox=new`} className="inline-flex h-8 items-center rounded-[9px] bg-accent px-3 text-[13px] font-medium text-on-accent hover:bg-accent-strong">Connect a mailbox</Link>}
            />
          </Card>
        )}
        {view === "received" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Filter"
                value={filter}
                onChange={(v) => { setFilter(v); setSelected(null); }}
                options={[
                  { value: "open", label: "Open" },
                  { value: "needs_human", label: <>Needs a person{counts.needs_human ? <span className="tabular text-faint">{counts.needs_human}</span> : null}</> },
                  { value: "all", label: "All" },
                  { value: "ignored", label: "Ignored" },
                ]}
              />
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
                <Input aria-label="Search e-mails" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sender or subject" className="pl-8" />
              </div>
            </div>
            {messages.isPending ? (
              <Card><LoadingRows /></Card>
            ) : messages.isError ? (
              <Card><ErrorState error={messages.error} retry={() => void messages.refetch()} /></Card>
            ) : msgItems.length === 0 ? (
              <Card><EmptyState icon={<Mail />} title={filter === "open" ? "No open e-mail" : "No e-mail here"} description="New mail is read every two minutes and appears here with what happened to it." compact /></Card>
            ) : (
              <TwoPane
                desktop={desktop}
                open={!!selected}
                onClose={() => setSelected(null)}
                title={currentMessage?.subject || "E-mail"}
                list={
                  <Card className="overflow-hidden lg:sticky lg:top-0" aria-label="Received e-mails">
                    <ul className="max-h-[calc(100dvh-220px)] divide-y divide-line-soft overflow-y-auto">
                      {msgItems.map((m) => <li key={m.id}><MessageRow m={m} selected={m.id === currentMessage?.id} onSelect={() => setSelected(m.id)} /></li>)}
                    </ul>
                  </Card>
                }
                detail={currentMessage ? <MessageDetailView cid={cid} id={currentMessage.id} canWrite={canWrite} /> : null}
              />
            )}
          </>
        ) : deliveries.isPending ? (
          <Card><LoadingRows /></Card>
        ) : deliveries.isError ? (
          <Card><ErrorState error={deliveries.error} retry={() => void deliveries.refetch()} /></Card>
        ) : dItems.length === 0 ? (
          <Card><EmptyState icon={<Send />} title="Nothing sent yet" description="An e-mail appears here once its result is verified and approved, or allowed by the agent's earned licence." compact /></Card>
        ) : (
          <>
            {attention > 0 && (
              <p className="flex items-center gap-2 text-xs text-warning"><AlertTriangle className="size-3.5" aria-hidden />{attention} e-mail{attention > 1 ? "s" : ""} wait for a person: not sent, held, failed or uncertain.</p>
            )}
            <TwoPane
              desktop={desktop}
              open={!!selected}
              onClose={() => setSelected(null)}
              title={currentDelivery?.subject ?? "E-mail"}
              list={
                <Card className="overflow-hidden lg:sticky lg:top-0" aria-label="Sent e-mails">
                  <ul className="max-h-[calc(100dvh-220px)] divide-y divide-line-soft overflow-y-auto">
                    {dItems.map((d) => <li key={d.id}><DeliveryRow d={d} selected={d.id === currentDelivery?.id} onSelect={() => setSelected(d.id)} /></li>)}
                  </ul>
                </Card>
              }
              detail={currentDelivery ? <DeliveryDetail cid={cid} d={currentDelivery} canWrite={canWrite} /> : null}
            />
          </>
        )}
      </PageBody>
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <MessagesInner />
    </Suspense>
  );
}
