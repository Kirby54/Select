"use client";

import { CheckCircle2, ExternalLink, KeyRound, Plug, XCircle } from "lucide-react";
import { useState } from "react";

import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { Badge, Button, Card, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { useAction, useCompany, useCompanyId, useConnections } from "@/lib/queries";
import type { Connection } from "@/lib/types";

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
      footer={<><Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button size="sm" variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        {connection.needs_key && (
          <Field label={connection.has_key ? `API key (stored: ${connection.key_hint}). Leave empty to keep it.` : "API key"} htmlFor="key">
            <Input id="key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
        )}
        <Field label="Base URL" htmlFor="base" hint={connection.default_base_url ? `Default: ${connection.default_base_url}` : "Leave empty for the provider's default"}>
          <Input id="base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={connection.default_base_url ?? ""} />
        </Field>
        <Field label="Prices per million tokens (for cost estimates)" htmlFor="prices" hint='One model per line: "model input output" in USD. Without a price, cost is recorded as 0 and flagged.'>
          <Textarea id="prices" value={prices} onChange={(e) => setPrices(e.target.value)} className="min-h-20 font-mono text-xs" />
        </Field>
        <Checkbox label="Enabled" description="Disabled connections cannot start runs." checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </div>
    </Dialog>
  );
}

export default function ConnectionsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const connections = useConnections(cid);
  const [editing, setEditing] = useState<Connection | null>(null);
  const test = useAction(cid, (provider: string) => api<Connection>(`/companies/${cid}/connections/${provider}/test`, { method: "POST" }), {
    success: (c) => (c.last_test_ok ? `Connected: ${c.models?.length ?? 0} models found` : `Test failed: ${c.last_error}`),
  });
  const remove = useAction(cid, (provider: string) => api(`/companies/${cid}/connections/${provider}`, { method: "DELETE" }), { success: "Connection removed and key erased" });
  const canAdmin = company.data && ["owner", "admin"].includes(company.data.role);

  return (
    <>
      <PageHeader title="Connections" description="Model providers your agents can use. Every adapter makes real calls; nothing here is simulated." />
      <PageBody>
        {connections.isPending ? <LoadingRows /> : connections.isError ? <ErrorState error={connections.error} retry={() => void connections.refetch()} /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {connections.data.map((c) => (
              <Card key={c.provider} className="flex flex-col">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <Plug className="mt-0.5 size-4 text-faint" aria-hidden />
                    <div>
                      <p className="font-medium">{c.label}</p>
                      <a href={c.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">Documentation <ExternalLink className="size-3" aria-hidden /></a>
                    </div>
                  </div>
                  {!c.configured ? <Badge>Not configured</Badge> : !c.enabled ? <Badge tone="warning">Disabled</Badge> :
                    c.last_test_ok === true ? <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Working</Badge> :
                    c.last_test_ok === false ? <Badge tone="danger"><XCircle className="size-3" aria-hidden />Test failed</Badge> : <Badge tone="accent">Not tested</Badge>}
                </div>
                <div className="flex-1 space-y-1 px-4 pb-3 text-xs text-muted">
                  {c.configured && c.needs_key && <p className="flex items-center gap-1.5"><KeyRound className="size-3" aria-hidden />Key {c.has_key ? c.key_hint : "missing"}</p>}
                  {c.base_url && <p className="truncate">Endpoint {c.base_url}</p>}
                  {c.last_test_at && <p>Last test {relative(c.last_test_at)}{c.models?.length ? ` · ${c.models.length} models` : ""}</p>}
                  {c.last_error && <p className="text-danger">{c.last_error}</p>}
                </div>
                {canAdmin && (
                  <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
                    <Button size="sm" onClick={() => setEditing(c)}>{c.configured ? "Edit" : "Configure"}</Button>
                    {c.configured && <Button size="sm" variant="ghost" loading={test.isPending && test.variables === c.provider} onClick={() => test.mutate(c.provider)}>Test connection</Button>}
                    {c.configured && (
                      <ConfirmDialog trigger={<Button size="sm" variant="ghost" className="ml-auto text-danger">Remove</Button>}
                        title={`Remove the ${c.label} connection?`} description="The stored key is erased. Agents using this provider stop being able to run live."
                        confirmLabel="Remove" onConfirm={() => remove.mutateAsync(c.provider)} />
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-faint">A test only lists the models the provider offers: no company data is sent. Gemini and Ollama are called through their documented HTTP APIs; Anthropic and OpenAI through their official SDKs.</p>
      </PageBody>
      {editing && <ConnectionDialog cid={cid} connection={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </>
  );
}
