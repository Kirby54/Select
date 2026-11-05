"use client";

import { CheckCircle2, Cloud, Server, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";

import { Button, Field, Input, Select, cx } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import type { Connection } from "@/lib/types";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", hint: "Claude models · console.anthropic.com" },
  { id: "openai", label: "OpenAI", hint: "GPT models · platform.openai.com" },
  { id: "gemini", label: "Google Gemini", hint: "Gemini models · aistudio.google.com" },
  { id: "ollama", label: "Ollama", hint: "Models on your own machine, no key" },
] as const;
type ProviderId = (typeof PROVIDERS)[number]["id"];

type ProbeResult = { ok: boolean; model: string; input_tokens: number; output_tokens: number; error: string | null };

/**
 * Connect one model provider, check the key with a real call that lists its models (no company
 * data is sent), then give every agent of the company the chosen model.
 */
export function ProviderSetup({ cid, onDone }: { cid: string; onDone: (summary: { provider: string; model: string; changed: number }) => void }) {
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);

  const connect = async () => {
    if (provider !== "ollama" && !key.trim()) return setError("Paste the API key from the provider's console.");
    setBusy(true);
    setError(null);
    setModels(null);
    setProbe(null);
    try {
      await api(`/companies/${cid}/connections/${provider}`, {
        method: "PUT",
        body: { api_key: provider === "ollama" ? null : key.trim(), base_url: provider === "ollama" ? baseUrl.trim() : null, enabled: true, prices: {} },
      });
      const tested = await api<Connection>(`/companies/${cid}/connections/${provider}/test`, { method: "POST" });
      if (!tested.last_test_ok) {
        setError(`The provider refused the connection: ${tested.last_error ?? "unknown error"}`);
      } else {
        const list = tested.models ?? [];
        setModels(list);
        setModel(list[0] ?? "");
        setProbe(null);
        setKey("");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const testGeneration = async () => {
    if (!model.trim()) return setError("Enter a model ID first.");
    setProbeBusy(true);
    setError(null);
    setProbe(null);
    try {
      const result = await api<ProbeResult>(`/companies/${cid}/connections/${provider}/probe`, {
        method: "POST",
        body: { model: model.trim(), consent: true },
      });
      setProbe(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProbeBusy(false);
    }
  };

  const apply = async () => {
    if (!model.trim()) return setError("Choose a model.");
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ changed: number }>(`/companies/${cid}/agents/model`, { method: "POST", body: { provider, model: model.trim() } });
      onDone({ provider, model: model.trim(), changed: result.changed });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Provider" className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={provider === p.id}
            tabIndex={provider === p.id ? 0 : -1}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
              event.preventDefault();
              if (busy || probeBusy) return;
              const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
              const index = PROVIDERS.findIndex((item) => item.id === provider);
              const target = PROVIDERS[(index + direction + PROVIDERS.length) % PROVIDERS.length]!;
              setProvider(target.id);
              setModels(null);
              setProbe(null);
              setError(null);
              const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
              radios?.[(index + direction + PROVIDERS.length) % PROVIDERS.length]?.focus();
            }}
            onClick={() => { if (busy || probeBusy) return; setProvider(p.id); setModels(null); setProbe(null); setError(null); }}
            className={cx(
              "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-[120ms]",
              provider === p.id ? "border-accent/60 bg-selected" : "border-line-soft hover:bg-hover",
            )}
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-hidden>
              {p.id === "ollama" ? <Server className="size-3.5" /> : <Cloud className="size-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-fg">{p.label}</span>
              <span className="block text-xs text-muted">{p.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />{error}
        </p>
      )}

      {models === null ? (
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
          <div className="min-w-0 flex-1">
            {provider === "ollama" ? (
              <Field label="Ollama address" htmlFor="ollama-url" hint="Reachable from the Select server, not only from your browser.">
                <Input id="ollama-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </Field>
            ) : (
              <Field label="API key" htmlFor="api-key" hint="Encrypted at rest; only its last four characters are shown afterwards.">
                <Input id="api-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
              </Field>
            )}
          </div>
          <Button type="submit" variant="primary" loading={busy}>Connect and test</Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-3.5 text-success" aria-hidden />Connection accepted. {models.length} model{models.length === 1 ? "" : "s"} listed; generation not yet verified.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field label="Model for every agent" htmlFor="model" hint="You can give an agent another model later on its page.">
                {models.length ? (
                  <Select id="model" value={model} onChange={(e) => { setModel(e.target.value); setProbe(null); }}>
                    {models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                ) : (
                  <Input id="model" value={model} onChange={(e) => { setModel(e.target.value); setProbe(null); }} placeholder="model name" />
                )}
              </Field>
            </div>
            <Button variant="primary" loading={busy} disabled={probeBusy} onClick={() => void apply()}>Use this model</Button>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-fg">Verify generation</p>
                <p className="mt-0.5 text-xs text-muted">
                  Listing models does not prove this model can respond. Run one harmless JSON request before real work.
                </p>
              </div>
              <Button
                size="sm"
                loading={probeBusy}
                disabled={busy || !model.trim()}
                onClick={() => void testGeneration()}
              >
                Test generation
              </Button>
            </div>
            <p className="text-xs text-faint">Optional and potentially billable. No company data is sent.</p>
            {probe && (
              <div role="status" aria-live="polite" className={cx(
                "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs",
                probe.ok ? "border-autonomous/30 bg-autonomous/8 text-fg" : "border-danger/30 bg-danger/8 text-danger",
              )}>
                {probe.ok ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-autonomous" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <div>
                  <p className="font-semibold">{probe.ok ? "Generation verified" : "Generation test failed"}</p>
                  <p className="mt-0.5 text-muted">
                    {probe.ok
                      ? `${probe.model} returned the expected JSON · ${probe.input_tokens} input tokens · ${probe.output_tokens} output tokens.`
                      : probe.error ?? "Check the model ID and your provider account."}
                  </p>
                </div>
              </div>
            )}
            {!probe?.ok && <p className="text-xs text-muted">You can still assign a model without this test, but its ability to generate a result is unverified.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
