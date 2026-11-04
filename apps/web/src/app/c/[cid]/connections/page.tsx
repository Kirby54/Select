"use client";

import { CheckCircle2, Cloud, ExternalLink, Inbox, KeyRound, Mail, Plus, RefreshCw, Send, Server, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { MailboxForm } from "@/components/mailbox-form";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { Badge, Button, Card, Field, Input, Switch, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction, useCompany, useCompanyId, useConnections, useMailboxes } from "@/lib/queries";
import type { Connection, Mailbox } from "@/lib/types";

function pricesToText(prices: Connection["prices"]): string {
  return Object.entries(prices ?? {}).map(([m, p]) => `${m} ${p.input} ${p.output}`).join("\n");
}

function parsePrices(text: string): { value?: Record<string, { input: string; output: string }>; error?: string } {
  const out: Record<string, { input: string; output: string }> = {};
  for (const [i, line] of text.split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
    const [model, input, output] = line.split(/\s+/);
    if (!model || !input || !output || !/^\d+(\.\d+)?$/.test(input) || !/^\d+(\.\d+)?$/.test(output)) {
      return { error: `Line ${i + 1}: write "model input output", e.g. "my-model 3.00 15.00"` };
    }
    out[model] = { input, output };
  }
  return { value: out };
}

function ConnectionDialog({ cid, connection, open, onOpenChange }: { cid: string; connection: Connection; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(connection.base_url ?? "");
  const [enabled, setEnabled] = useState(connection.enabled ?? true);
  const [prices, setPrices] = useState(pricesToText(connection.prices));
  const [error, setError] = useState<string | null>(null);
  const save = useAction(cid, (body: Record<string, unknown>) => api(`/companies/${cid}/connections/${connection.provider}`, { method: "PUT", body }), {
    success: `${connection.label} saved`,
    onSuccess: () => { setKey(""); onOpenChange(false); },
  });
  const submit = () => {
    const parsed = parsePrices(prices);
    if (parsed.error) return setError(parsed.error);
    if (!connection.configured && connection.needs_key && !key.trim()) return setError("An API key is required for this provider.");
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) return setError("The base URL must start with http:// or https://");
    setError(null);
    save.mutate({ api_key: key.trim() || null, base_url: baseUrl.trim() || null, enabled, prices: parsed.value ?? {} });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`${connection.label} connection`}
      description="Keys are encrypted at rest and never shown again; only their last four characters are displayed."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">{error}</p>}
        {connection.needs_key && (
          <Field label="API key" htmlFor="key" hint={connection.has_key ? `Stored: ${connection.key_hint}. Leave empty to keep it.` : "Paste the key from your provider's console."}>
            <Input id="key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
        )}
        <Field label="Base URL" htmlFor="base" hint={connection.default_base_url ? `Default: ${connection.default_base_url}` : "Leave empty for the provider's default"}>
          <Input id="base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={connection.default_base_url ?? ""} />
        </Field>
        <Field label="Prices per million tokens" htmlFor="prices" hint='One model per line: "model input output" in USD. Without a price, cost is recorded as 0 and flagged.'>
          <Textarea id="prices" value={prices} onChange={(e) => setPrices(e.target.value)} className="min-h-20 font-mono text-xs" />
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line-soft px-3 py-2.5">
          <div>
            <p className="text-[13px] text-fg">Enabled</p>
            <p className="text-xs text-faint">Disabled connections cannot start runs.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} label="Enabled" />
        </div>
      </div>
    </Dialog>
  );
}

function StatusBadge({ c }: { c: Connection }) {
  if (!c.configured) return <Badge>Not configured</Badge>;
  if (!c.enabled) return <Badge tone="warning">Disabled</Badge>;
  if (c.last_test_ok === true) return <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Working</Badge>;
  if (c.last_test_ok === false) return <Badge tone="danger"><XCircle className="size-3" aria-hidden />Test failed</Badge>;
  return <Badge tone="accent">Not tested yet</Badge>;
}

function MailboxState({ m }: { m: Mailbox }) {
  return (
    <dl className="space-y-1 text-xs">
      <div className="flex items-start gap-1.5">
        <Inbox className="mt-px size-3 shrink-0 text-faint" aria-hidden />
        <dt className="sr-only">Reading</dt>
        <dd className={m.inbound_enabled && m.last_poll_ok === false ? "text-danger" : "text-muted"}>
          {!m.inbound_enabled ? "Reading off" :
            m.last_poll_ok === false ? `Reading failed: ${m.last_poll_error}` :
            m.last_poll_at ? `Reading ${m.imap_folder} · checked ${relative(m.last_poll_at)}` : "Reading on · first check within two minutes"}
        </dd>
      </div>
      <div className="flex items-start gap-1.5">
        <Send className="mt-px size-3 shrink-0 text-faint" aria-hidden />
        <dt className="sr-only">Sending</dt>
        <dd className={m.outbound_enabled && m.last_smtp_test_ok === false ? "text-danger" : "text-muted"}>
          {!m.outbound_enabled ? "Sending off: approved replies wait, ready to copy" :
            m.last_smtp_test_ok === false ? `Sending test failed: ${m.last_smtp_error}` :
            m.last_smtp_test_ok ? `Sending through ${m.smtp_host} · tested ${relative(m.last_smtp_test_at)}` : `Sending through ${m.smtp_host} · not tested yet`}
        </dd>
      </div>
    </dl>
  );
}

function Mailboxes({ cid, companyName, canAdmin, demo }: { cid: string; companyName: string; canAdmin: boolean; demo: boolean }) {
  const mailboxes = useMailboxes(cid);
  const params = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<Mailbox | "new" | null>(params.get("mailbox") === "new" && canAdmin && !demo ? "new" : null);
  const poll = useAction(cid, (id: string) => api(`/companies/${cid}/mailboxes/${id}/poll`, { method: "POST" }), { success: "Reading now; new mail appears in Messages" });
  const remove = useAction(cid, (id: string) => api(`/companies/${cid}/mailboxes/${id}`, { method: "DELETE" }), { success: "Mailbox removed; its passwords were erased" });
  const close = () => { setEditing(null); if (params.get("mailbox")) router.replace(`/c/${cid}/connections`, { scroll: false }); };
  return (
    <section className="space-y-2" aria-labelledby="mailboxes-title">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="mailboxes-title" className="text-[13px] font-semibold">Mailboxes</h2>
          <p className="mt-0.5 text-xs text-muted">New e-mail becomes tasks; approved replies leave from here.</p>
        </div>
        {canAdmin && !demo && <Button size="sm" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setEditing("new")}>Connect a mailbox</Button>}
      </div>
      {demo ? (
        <Card><p className="px-4 py-3 text-[13px] text-muted">The demo company cannot read or send real e-mail.</p></Card>
      ) : mailboxes.isPending ? (
        <Card><LoadingRows rows={2} /></Card>
      ) : mailboxes.isError ? (
        <Card><ErrorState error={mailboxes.error} retry={() => void mailboxes.refetch()} compact /></Card>
      ) : mailboxes.data.length === 0 ? (
        <Card><EmptyState compact icon={<Mail />} title="No mailbox yet" description="Without one, tasks are created by hand and approved replies stay ready to copy." /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {mailboxes.data.map((m) => (
            <Card key={m.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted" aria-hidden><Mail className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{m.address}</p>
                    <p className="truncate text-xs text-muted">{m.label}{m.display_name ? ` · sends as “${m.display_name}”` : ""}</p>
                  </div>
                </div>
                {(m.inbound_enabled && m.last_poll_ok === false) || (m.outbound_enabled && m.last_smtp_test_ok === false)
                  ? <Badge tone="danger"><XCircle className="size-3" aria-hidden />Problem</Badge>
                  : m.inbound_enabled || m.outbound_enabled ? <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />On</Badge> : <Badge>Off</Badge>}
              </div>
              <div className="flex-1 px-4 pb-3"><MailboxState m={m} /></div>
              {canAdmin && (
                <div className="flex flex-wrap gap-2 border-t border-line-soft px-4 py-2.5">
                  <Button size="sm" onClick={() => setEditing(m)}>Edit</Button>
                  {m.inbound_enabled && <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" aria-hidden />} loading={poll.isPending && poll.variables === m.id} onClick={() => poll.mutate(m.id)}>Read now</Button>}
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost" className="ml-auto text-danger hover:text-danger">Remove</Button>}
                    title={`Remove ${m.address}?`}
                    description="Select stops reading and sending through it and erases its passwords. E-mails already received stay in Messages."
                    confirmLabel="Remove"
                    onConfirm={() => remove.mutateAsync(m.id)}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <Dialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) close(); }}
          wide
          title={editing === "new" ? "Connect a mailbox" : `Edit ${editing.address}`}
          description="Passwords are encrypted at rest and never shown again. Saving tests the connection: Select logs in and sends nothing."
        >
          <MailboxForm
            key={editing === "new" ? "new" : editing.id}
            cid={cid}
            companyName={companyName}
            mailbox={editing === "new" ? undefined : editing}
            onSaved={() => void mailboxes.refetch()}
          />
        </Dialog>
      )}
    </section>
  );
}

function ConnectionsInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const connections = useConnections(cid);
  const [editing, setEditing] = useState<Connection | null>(null);
  const test = useAction(cid, (provider: string) => api<Connection>(`/companies/${cid}/connections/${provider}/test`, { method: "POST" }), {
    success: (c) => (c.last_test_ok ? `Connected: ${c.models?.length ?? 0} models found` : `Test failed: ${c.last_error}`),
  });
  const remove = useAction(cid, (provider: string) => api(`/companies/${cid}/connections/${provider}`, { method: "DELETE" }), { success: "Connection removed and key erased" });
  const canAdmin = !!company.data && ["owner", "admin"].includes(company.data.role);

  return (
    <>
      <PageHeader title="Connections" description="Model providers your agents use and the mailboxes they read and send from" />
      <PageBody className="max-w-5xl space-y-8">
        {company.data && <Mailboxes cid={cid} companyName={company.data.name} canAdmin={canAdmin} demo={company.data.is_demo} />}
        <section className="space-y-2" aria-labelledby="models-title">
        <div className="px-1">
          <h2 id="models-title" className="text-[13px] font-semibold">AI models</h2>
          <p className="mt-0.5 text-xs text-muted">Keys are stored encrypted; only their last four characters are shown.</p>
        </div>
        {connections.isPending ? <LoadingRows /> : connections.isError ? <ErrorState error={connections.error} retry={() => void connections.refetch()} /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {connections.data.map((c) => (
              <Card key={c.provider} className="flex flex-col">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted" aria-hidden>
                      {c.provider === "ollama" ? <Server className="size-4" /> : <Cloud className="size-4" />}
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold">{c.label}</p>
                      <a href={c.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">Documentation <ExternalLink className="size-3" aria-hidden /></a>
                    </div>
                  </div>
                  <StatusBadge c={c} />
                </div>
                <dl className="flex-1 space-y-1 px-4 pb-3 text-xs">
                  {c.configured && c.needs_key && <div className="flex items-center gap-1.5 text-muted"><KeyRound className="size-3" aria-hidden /><dt className="sr-only">Key</dt><dd>Key {c.has_key ? <span className="font-mono">{c.key_hint}</span> : "missing"}</dd></div>}
                  {c.base_url && <div className="truncate text-muted"><dt className="inline">Endpoint </dt><dd className="inline font-mono">{c.base_url}</dd></div>}
                  {c.last_test_at && <div className="text-muted"><dt className="inline">Last test </dt><dd className="inline">{relative(c.last_test_at)}{c.models?.length ? ` · ${c.models.length} models` : ""}</dd></div>}
                  {c.last_error && <div className="text-danger"><dt className="sr-only">Error</dt><dd>{c.last_error}</dd></div>}
                  {!c.configured && <div className="text-faint"><dd>Agents using {c.label} stay “not connected” until this is configured.</dd></div>}
                </dl>
                {canAdmin && (
                  <div className="flex flex-wrap gap-2 border-t border-line-soft px-4 py-2.5">
                    <Button size="sm" onClick={() => setEditing(c)}>{c.configured ? "Edit" : "Configure"}</Button>
                    {c.configured && <Button size="sm" variant="ghost" loading={test.isPending && test.variables === c.provider} onClick={() => test.mutate(c.provider)}>Test connection</Button>}
                    {c.configured && (
                      <ConfirmDialog trigger={<Button size="sm" variant="ghost" className="ml-auto text-danger hover:text-danger">Remove</Button>}
                        title={`Remove the ${c.label} connection?`} description="The stored key is erased. Agents using this provider stop being able to run live."
                        confirmLabel="Remove" onConfirm={() => remove.mutateAsync(c.provider)} />
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        </section>
      </PageBody>
      {editing && <ConnectionDialog cid={cid} connection={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <ConnectionsInner />
    </Suspense>
  );
}
