"use client";

import { Activity, BadgeCheck, Building2, CircleDollarSign, Copy, KeyRound, Lock, Package, Plug, Plus, ShieldCheck, Trash2, UserRound, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { CatalogImport } from "@/components/catalog-import";
import { AutonomyLevel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Badge, Button, Card, IconButton, Input, Select, Switch, Textarea, cx } from "@/components/ui/primitives";
import { api, errorMessage, getToken, setToken } from "@/lib/api";
import { fractionFromPercent, ratePercent, relative, taskTypeLabel } from "@/lib/format";
import { useAction, useAuthState, useCompany, useCompanyId, useCountries, useInvitations, useMembers, useTokens } from "@/lib/queries";
import type { ApiTokenRow, CatalogItem, Company, CompanySettings, Invitation, Level, Role } from "@/lib/types";

/* macOS-style building blocks: a titled group of rows, label on the left, control on the right. */
function Group({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <Card className="overflow-hidden">
        <div className="divide-y divide-line-soft">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-canvas/30 px-4 py-2.5">{footer}</div>}
      </Card>
    </section>
  );
}

function Row({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(200px,280px)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        {htmlFor ? <label htmlFor={htmlFor} className="text-[13px] text-fg">{label}</label> : <span className="text-[13px] text-fg">{label}</span>}
        {hint && !error && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
        {error && <p role="alert" className="mt-0.5 text-xs text-danger">{error}</p>}
      </div>
      <div className="min-w-0 sm:justify-self-end sm:text-right">{children}</div>
    </div>
  );
}

function GeneralSection({ company, canAdmin }: { company: Company; canAdmin: boolean }) {
  const countries = useCountries();
  const [name, setName] = useState(company.name);
  const [budget, setBudget] = useState(company.monthly_budget);
  const [country, setCountry] = useState(company.country);
  const [currency, setCurrency] = useState(company.currency);
  const [rates, setRates] = useState(company.vat_rates.map((r) => ratePercent(r).replace(" %", "")).join(", "));
  const [zone, setZone] = useState(company.timezone);
  const [language, setLanguage] = useState(company.language);
  const save = useAction(company.id, (body: Record<string, unknown>) => api(`/companies/${company.id}`, { method: "PATCH", body }), { success: "Company saved" });
  const budgetValid = /^\d+(\.\d{1,2})?$/.test(budget);
  const fractions = rates.split(/[,;\s]+/).filter(Boolean).map(fractionFromPercent);
  const ratesValid = fractions.length > 0 && fractions.every((f) => f !== null);
  const choose = (code: string) => {
    setCountry(code);
    const preset = countries.data?.find((c) => c.code === code);
    if (preset) {
      setCurrency(preset.currency);
      setRates(preset.vat_rates.map((r) => ratePercent(r).replace(" %", "")).join(", "));
      setZone(preset.timezone);
    }
  };
  const submit = () =>
    save.mutate({
      name: name.trim(),
      monthly_budget: budget.trim(),
      country,
      currency,
      vat_rates: fractions as string[],
      timezone: zone.trim(),
      language,
    });
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-6">
      <Group
        title="Company"
        description="Name and the spending limit that stops live runs."
        footer={canAdmin ? <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!name.trim() || !budgetValid || !ratesValid}>Save</Button> : undefined}
      >
        <Row label="Name" htmlFor="s-name" error={!name.trim() ? "A name is required" : undefined}>
          <Input id="s-name" value={name} disabled={!canAdmin} onChange={(e) => setName(e.target.value)} />
        </Row>
        <Row label="Monthly AI budget" htmlFor="s-budget" hint="In USD, like the provider prices in Connections. Live runs stop when it is reached; 0 means no limit." error={budget && !budgetValid ? "Use a number such as 200.00" : undefined}>
          <Input id="s-budget" inputMode="decimal" value={budget} disabled={!canAdmin} onChange={(e) => setBudget(e.target.value)} className="text-right tabular" />
        </Row>
        <Row label="Your role"><span className="text-[13px] text-muted capitalize">{company.role}</span></Row>
        <Row label="Kind of company"><span className="text-[13px] text-muted">{company.is_demo ? "Demo (recorded outputs, no model is called)" : "Live"}</span></Row>
      </Group>
      <Group title="Country and tax" description="VAT rates are enforced on the catalog and in every quote check. Presets were checked on 3 November 2026; confirm them with your accountant.">
        <Row label="Country" htmlFor="s-country">
          <Select id="s-country" value={country} disabled={!canAdmin} onChange={(e) => choose(e.target.value)}>
            {(countries.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            {!countries.data?.some((c) => c.code === country) && <option value={country}>{country === "ZZ" ? "Another country" : country}</option>}
          </Select>
        </Row>
        <Row label="VAT rates (%)" htmlFor="s-vat" hint="Separated by commas" error={!ratesValid ? "Write percentages, for example 20, 10, 5.5, 0" : undefined}>
          <Input id="s-vat" value={rates} disabled={!canAdmin} onChange={(e) => setRates(e.target.value)} className="tabular" />
        </Row>
        <Row label="Currency" htmlFor="s-cur"><Input id="s-cur" value={currency} maxLength={3} disabled={!canAdmin} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Row>
        <Row label="Time zone" htmlFor="s-tz" hint="Routines run in this time zone"><Input id="s-tz" value={zone} disabled={!canAdmin} onChange={(e) => setZone(e.target.value)} /></Row>
        <Row label="Language for customers" htmlFor="s-lang" hint="Used when a customer's own language is unclear, and for quote e-mails">
          <Select id="s-lang" value={language} disabled={!canAdmin} onChange={(e) => setLanguage(e.target.value as Company["language"])}>
            <option value="fr">Français</option><option value="de">Deutsch</option><option value="en">English</option>
          </Select>
        </Row>
      </Group>
    </form>
  );
}

const CATEGORIES: { id: keyof CompanySettings["routing"]; label: string }[] = [
  { id: "quote_request", label: "Quote requests go to" },
  { id: "support", label: "Customer questions go to" },
  { id: "invoice_question", label: "Invoice questions go to" },
  { id: "spam", label: "Spam goes to" },
  { id: "other", label: "Everything else goes to" },
];

function AutomationSection({ company, canAdmin }: { company: Company; canAdmin: boolean }) {
  const [settings, setSettings] = useState<CompanySettings>(company.settings);
  const save = useAction(company.id, (body: Record<string, unknown>) => api(`/companies/${company.id}`, { method: "PATCH", body: { settings: body } }), { success: "Automation saved" });
  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => setSettings({ ...settings, [key]: value });
  const capValid = Number.isInteger(settings.outbound_per_hour) && settings.outbound_per_hour >= 0 && settings.outbound_per_hour <= 500;
  return (
    <div className="space-y-6">
      <Group
        title="Work that moves by itself"
        description="Code acts on verified results only: a model never decides to start, route or send anything."
        footer={canAdmin ? <Button size="sm" variant="primary" loading={save.isPending} disabled={!capValid} onClick={() => save.mutate(settings as unknown as Record<string, unknown>)}>Save</Button> : undefined}
      >
        <Row label="Start tasks automatically" hint="As soon as a task is assigned to an agent whose model is connected">
          <Switch checked={settings.auto_run} disabled={!canAdmin} onCheckedChange={(v) => set("auto_run", v)} label="Start tasks automatically" />
        </Row>
        {CATEGORIES.map((c) => (
          <Row key={c.id} label={c.label} htmlFor={`route-${c.id}`}>
            <Select id={`route-${c.id}`} value={settings.routing[c.id]} disabled={!canAdmin} onChange={(e) => set("routing", { ...settings.routing, [c.id]: e.target.value })}>
              <option value="human">A person (Messages)</option>
              <option value="quote">{taskTypeLabel("quote")}</option>
              <option value="support_reply">{taskTypeLabel("support_reply")}</option>
              <option value="general_task">{taskTypeLabel("general_task")}</option>
              <option value="ignore">Ignore</option>
            </Select>
          </Row>
        ))}
      </Group>
      <Group title="Outgoing e-mail" description="Limits that hold for every agent, whatever its licence.">
        <Row label="E-mails per hour" htmlFor="s-cap" hint="Above it, e-mails wait for a person. 0 holds every e-mail." error={!capValid ? "A whole number from 0 to 500" : undefined}>
          <Input id="s-cap" inputMode="numeric" value={String(settings.outbound_per_hour)} disabled={!canAdmin} onChange={(e) => set("outbound_per_hour", Number(e.target.value.replace(/\D/g, "") || 0))} className="text-right tabular" />
        </Row>
        <Row label="Say when no person reviewed it" htmlFor="s-ai" hint="Adds one sentence at the end of the e-mail. Check what the law asks of you (for example Article 50 of the EU AI Act).">
          <Select id="s-ai" value={settings.ai_disclosure} disabled={!canAdmin} onChange={(e) => set("ai_disclosure", e.target.value as CompanySettings["ai_disclosure"])}>
            <option value="autonomous">When sent without review</option>
            <option value="always">On every e-mail</option>
            <option value="never">Never</option>
          </Select>
        </Row>
        <Row label="Quotes are valid for (days)" htmlFor="s-valid">
          <Input id="s-valid" inputMode="numeric" value={String(settings.quote_validity_days)} disabled={!canAdmin} onChange={(e) => set("quote_validity_days", Math.max(1, Math.min(365, Number(e.target.value.replace(/\D/g, "") || 1))))} className="text-right tabular" />
        </Row>
        <div className="px-4 py-3">
          <label htmlFor="s-sign" className="text-[13px] text-fg">Signature</label>
          <p className="mt-0.5 text-xs text-faint">Added to every e-mail. Include the legal mentions your country requires (company number, address, VAT number).</p>
          <Textarea id="s-sign" value={settings.signature} disabled={!canAdmin} onChange={(e) => set("signature", e.target.value)} className="mt-2 min-h-20" />
        </div>
      </Group>
    </div>
  );
}

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including roles and owners",
  admin: "Settings, agents, connections, invitations",
  member: "Tasks, approvals, messages",
  viewer: "Reads everything, changes nothing",
};

function PeopleSection({ company }: { company: Company }) {
  const auth = useAuthState();
  const members = useMembers(company.id);
  const isAdmin = company.role === "owner" || company.role === "admin";
  const invitations = useInvitations(company.id, isAdmin && auth.data?.mode === "password");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("member");
  const [link, setLink] = useState<string | null>(null);
  const toast = useToast();
  const invite = useAction(company.id, (body: Record<string, unknown>) => api<Invitation>(`/companies/${company.id}/invitations`, { method: "POST", body }), {
    success: "Invitation created",
    onSuccess: (i) => { setLink(i.link ?? null); setEmail(""); },
  });
  const revoke = useAction(company.id, (id: string) => api(`/companies/${company.id}/invitations/${id}`, { method: "DELETE" }), { success: "Invitation revoked" });
  const changeRole = useAction(company.id, (v: { id: string; role: Role }) => api(`/companies/${company.id}/members/${v.id}`, { method: "PATCH", body: { role: v.role } }), { success: "Role changed" });
  const remove = useAction(company.id, (id: string) => api(`/companies/${company.id}/members/${id}`, { method: "DELETE" }), { success: "Member removed" });
  if (auth.data && auth.data.mode !== "password") {
    return (
      <Group title="People" description="Sign-in with passwords is off on this server.">
        <div className="px-4 py-3 text-[13px] text-muted">
          {auth.data.mode === "local" ? "Local mode has one implicit owner and is meant for your own machine." : "Token mode identifies scripts by API token."} To invite people, start Select with <code className="font-mono text-xs">SELECT_AUTH_MODE=password</code> (see docs/deployment.md).
        </div>
      </Group>
    );
  }
  return (
    <div className="space-y-6">
      <Group title="Members" description="Roles are checked by the server on every request.">
        {members.isPending ? <LoadingRows rows={2} /> : members.isError ? <ErrorState error={members.error} compact /> : members.data.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold" aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-fg">{m.name}{m.is_you && <span className="text-faint"> (you)</span>}</p>
              <p className="truncate text-xs text-faint">{m.email}</p>
            </div>
            {company.role === "owner" && !m.is_you ? (
              <Select aria-label={`Role of ${m.name}`} value={m.role} onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })} className="h-8 w-28 text-xs">
                <option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
              </Select>
            ) : (
              <Badge tone={m.role === "owner" ? "accent" : "neutral"}><span className="capitalize">{m.role}</span></Badge>
            )}
            {isAdmin && !m.is_you && (company.role === "owner" || m.role !== "owner") && (
              <ConfirmDialog
                trigger={<IconButton label={`Remove ${m.name}`}><Trash2 className="size-3.5" aria-hidden /></IconButton>}
                title={`Remove ${m.name}?`}
                description="They lose access to this company at once. Their past actions stay in the activity log."
                confirmLabel="Remove"
                onConfirm={() => remove.mutateAsync(m.id)}
              />
            )}
          </div>
        ))}
      </Group>
      {isAdmin && (
        <Group title="Invite someone" description="Select creates a link for one e-mail address, valid for 7 days. Send it yourself; the person chooses their own password.">
          <form className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]" onSubmit={(e) => { e.preventDefault(); setLink(null); invite.mutate({ email: email.trim(), role }); }}>
            <Input aria-label="E-mail address to invite" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, "owner">)}>
              <option value="member">Member</option><option value="viewer">Viewer</option>{company.role === "owner" && <option value="admin">Admin</option>}
            </Select>
            <Button type="submit" size="md" variant="primary" loading={invite.isPending} disabled={!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email.trim())}>Create link</Button>
            <p className="text-xs text-faint sm:col-span-3">{ROLE_HELP[role]}.</p>
          </form>
          {link && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <code className="min-w-0 flex-1 truncate rounded-md bg-canvas px-2 py-1.5 font-mono text-xs text-fg">{link}</code>
              <Button size="sm" icon={<Copy className="size-3.5" aria-hidden />} onClick={async () => { try { await navigator.clipboard.writeText(link); toast.show({ tone: "success", title: "Link copied" }); } catch (e) { toast.show({ tone: "error", title: `Copy it by hand: ${errorMessage(e)}` }); } }}>Copy</Button>
              <p className="w-full text-xs text-faint">Shown once. Anyone with this link can join as {role} until it is used or revoked.</p>
            </div>
          )}
          {(invitations.data ?? []).map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-fg">{i.email}</p>
                <p className="text-xs text-faint">Invited as {i.role} · {relative(i.expires_at).startsWith("in ") ? "expires" : "expired"} {relative(i.expires_at)}</p>
              </div>
              <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>Revoke</Button>
            </div>
          ))}
        </Group>
      )}
    </div>
  );
}

function AccountSection() {
  const auth = useAuthState();
  const password = auth.data?.mode === "password";
  const tokens = useTokens(!!auth.data && auth.data.mode !== "local");
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  if (auth.isPending) return <LoadingRows rows={3} />;
  if (auth.data?.mode === "token") return <TokenPaste />;
  if (!password) {
    return (
      <Group title="Your account" description="Local mode: one implicit owner, no password.">
        <div className="px-4 py-3 text-[13px] text-muted">For a shared server, start Select with <code className="font-mono text-xs">SELECT_AUTH_MODE=password</code>: the first visit then creates the owner account.</div>
      </Group>
    );
  }
  const changePassword = async () => {
    setBusy(true);
    try {
      const result = await api<{ other_sessions_ended: number }>("/auth/password", { method: "POST", body: { current_password: current, new_password: next } });
      toast.show({ tone: "success", title: `Password changed${result.other_sessions_ended ? `; ${result.other_sessions_ended} other session(s) signed out` : ""}` });
      setCurrent("");
      setNext("");
    } catch (e) {
      toast.show({ tone: "error", title: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const createToken = async () => {
    try {
      const row = await api<ApiTokenRow>("/auth/tokens", { method: "POST", body: { name: tokenName.trim() } });
      setCreated(row.token ?? null);
      setTokenName("");
      void tokens.refetch();
    } catch (e) {
      toast.show({ tone: "error", title: errorMessage(e) });
    }
  };
  const revoke = async (id: string) => {
    try {
      await api(`/auth/tokens/${id}`, { method: "DELETE" });
      void tokens.refetch();
      toast.show({ tone: "success", title: "Token revoked" });
    } catch (e) {
      toast.show({ tone: "error", title: errorMessage(e) });
    }
  };
  return (
    <div className="space-y-6">
      <Group title="Your account" description={`Signed in as ${auth.data?.user?.email ?? ""}.`}>
        <Row label="Current password" htmlFor="p-current"><Input id="p-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Row>
        <Row label="New password" htmlFor="p-new" hint="At least 10 characters. Your other browsers are signed out." error={next && next.length < 10 ? "At least 10 characters" : undefined}>
          <Input id="p-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Row>
        <div className="flex justify-end px-4 py-2.5"><Button size="sm" variant="primary" loading={busy} disabled={!current || next.length < 10} onClick={() => void changePassword()}>Change password</Button></div>
      </Group>
      <Group title="API tokens" description="For scripts and agent runtimes that submit work through the API. A token acts with your rights; revoke it when it is no longer used.">
        <form className="flex flex-wrap gap-2 px-4 py-3" onSubmit={(e) => { e.preventDefault(); if (tokenName.trim()) void createToken(); }}>
          <Input aria-label="Token name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Name, for example: my agent runtime" className="min-w-0 flex-1" />
          <Button type="submit" size="md" disabled={!tokenName.trim()}>Create token</Button>
        </form>
        {created && (
          <div className="space-y-1.5 px-4 py-3">
            <code className="block truncate rounded-md bg-canvas px-2 py-1.5 font-mono text-xs text-fg">{created}</code>
            <p className="text-xs text-faint">Shown once: store it in a password manager. Send it as <code className="font-mono">Authorization: Bearer …</code>.</p>
          </div>
        )}
        {(tokens.data ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <KeyRound className="size-3.5 text-faint" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-fg">{t.name}</p>
              <p className="text-xs text-faint">Created {relative(t.created_at)} · {t.last_used_at ? `last used ${relative(t.last_used_at)}` : "never used"}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void revoke(t.id)}>Revoke</Button>
          </div>
        ))}
      </Group>
    </div>
  );
}

function PolicySection({ company, canAdmin }: { company: Company; canAdmin: boolean }) {
  const p = company.policy;
  const [supervised, setSupervised] = useState(String(p.promote_after?.supervised ?? 20));
  const [sampled, setSampled] = useState(String(p.promote_after?.sampled ?? 50));
  const [rate, setRate] = useState(String(Math.round((p.sample_rate ?? 0.2) * 100)));
  const [caps, setCaps] = useState<Record<string, Level>>({ low: "autonomous", medium: "autonomous", high: "supervised", ...(p.max_level_by_risk ?? {}) });
  const save = useAction(company.id, (policy: Record<string, unknown>) => api(`/companies/${company.id}`, { method: "PATCH", body: { policy } }), { success: "Autonomy policy saved" });
  const num = (v: string) => /^\d+$/.test(v) && Number(v) >= 1;
  const valid = num(supervised) && num(sampled) && /^\d+$/.test(rate) && Number(rate) <= 100;
  return (
    <div className="space-y-6">
      <Group
        title="Promotion"
        description="Starting hypotheses, not proven values: calibrate them on your own results."
        footer={canAdmin ? (
          <Button size="sm" variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate({
            promote_after: { supervised: Number(supervised), sampled: Number(sampled) },
            sample_rate: Number(rate) / 100,
            max_level_by_risk: caps,
          })}>Save policy</Button>
        ) : undefined}
      >
        <Row label="Supervised → sampled after" htmlFor="p-sup" hint="Verified successes in a row" error={!num(supervised) ? "A whole number, at least 1" : undefined}>
          <Input id="p-sup" inputMode="numeric" value={supervised} disabled={!canAdmin} onChange={(e) => setSupervised(e.target.value)} className="text-right tabular" />
        </Row>
        <Row label="Sampled → autonomous after" htmlFor="p-sam" hint="Verified successes in a row" error={!num(sampled) ? "A whole number, at least 1" : undefined}>
          <Input id="p-sam" inputMode="numeric" value={sampled} disabled={!canAdmin} onChange={(e) => setSampled(e.target.value)} className="text-right tabular" />
        </Row>
        <Row label="Sampled review rate" htmlFor="p-rate" hint="Share of a sampled agent's results that go to a human, in %">
          <Input id="p-rate" inputMode="numeric" value={rate} disabled={!canAdmin} onChange={(e) => setRate(e.target.value)} className="text-right tabular" />
        </Row>
        {(["low", "medium", "high"] as const).map((risk) => (
          <Row key={risk} label={`Highest level for ${risk}-risk work`} htmlFor={`cap-${risk}`}>
            <Select id={`cap-${risk}`} value={caps[risk]} disabled={!canAdmin} onChange={(e) => setCaps({ ...caps, [risk]: e.target.value as Level })}>
              <option value="supervised">Supervised</option><option value="sampled">Sampled</option><option value="autonomous">Autonomous</option>
            </Select>
          </Row>
        ))}
        <Row label="Legal-risk work" hint="Payments, signatures, hiring, firing and tax filings. Fixed in code; no setting or agent can change it.">
          <span className="inline-flex items-center gap-2"><AutonomyLevel level="supervised" /><Lock className="size-3.5 text-faint" aria-label="Fixed" /></span>
        </Row>
      </Group>
    </div>
  );
}

function CatalogSection({ company, canAdmin }: { company: Company; canAdmin: boolean }) {
  const [rows, setRows] = useState<CatalogItem[]>(company.catalog);
  const save = useAction(company.id, (items: CatalogItem[]) => api(`/companies/${company.id}/catalog`, { method: "PUT", body: items as unknown as Record<string, unknown>[] }), { success: "Catalog saved" });
  const update = (i: number, patch: Partial<CatalogItem>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const invalid = rows.some((r) => !r.ref.trim() || !r.label.trim() || !r.unit.trim() || !/^\d+(\.\d{1,2})?$/.test(r.unit_price));
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[13px] font-semibold text-fg">Catalog</h2>
        <p className="mt-0.5 text-xs text-muted">The only source of prices for quotes and invoices. A price outside the catalog fails verification.</p>
      </div>
      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <caption className="sr-only">Catalog items</caption>
            <thead><tr className="border-b border-line-soft text-left text-xs text-faint">
              <th scope="col" className="px-4 py-2 font-medium">Ref</th><th scope="col" className="px-2 py-2 font-medium">Label</th><th scope="col" className="px-2 py-2 font-medium">Unit</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Unit price</th><th scope="col" className="px-2 py-2 font-medium">VAT</th><th scope="col" className="px-4 py-2"><span className="sr-only">Remove</span></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-1.5"><Input aria-label="Reference" value={r.ref} disabled={!canAdmin} onChange={(e) => update(i, { ref: e.target.value })} className="h-7 font-mono text-xs" /></td>
                  <td className="px-2 py-1.5"><Input aria-label="Label" value={r.label} disabled={!canAdmin} onChange={(e) => update(i, { label: e.target.value })} className="h-7 text-xs" /></td>
                  <td className="px-2 py-1.5"><Input aria-label="Unit" value={r.unit} disabled={!canAdmin} onChange={(e) => update(i, { unit: e.target.value })} className="h-7 w-20 text-xs" /></td>
                  <td className="px-2 py-1.5"><Input aria-label="Unit price" inputMode="decimal" value={r.unit_price} disabled={!canAdmin} onChange={(e) => update(i, { unit_price: e.target.value })} className="h-7 w-28 text-right text-xs tabular" /></td>
                  <td className="px-2 py-1.5">
                    <Select aria-label="VAT rate" value={r.vat_rate} disabled={!canAdmin} onChange={(e) => update(i, { vat_rate: e.target.value })} className="h-7 w-24 text-xs">
                      {company.vat_rates.map((rate) => <option key={rate} value={rate}>{ratePercent(rate)}</option>)}
                      {!company.vat_rates.includes(r.vat_rate) && <option value={r.vat_rate}>{ratePercent(r.vat_rate)}</option>}
                    </Select>
                  </td>
                  <td className="px-4 py-1.5 text-right">{canAdmin && <IconButton label={`Remove ${r.ref || "row"}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-3.5" aria-hidden /></IconButton>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-[13px] text-faint">No item yet. Quotes cannot be priced without a catalog.</td></tr>}
            </tbody>
          </table>
        </div>
        {canAdmin && (
          <div className="flex justify-between border-t border-line-soft bg-canvas/30 px-4 py-2.5">
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setRows([...rows, { ref: "", label: "", unit: "pc", unit_price: "0.00", vat_rate: company.vat_rates[0] ?? "0" }])}>Add item</Button>
            <Button size="sm" variant="primary" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(rows)}>Save catalog</Button>
          </div>
        )}
      </Card>
      {canAdmin && (
        <Card className="p-4">
          <h3 className="mb-2 text-[13px] font-semibold">Import from a spreadsheet</h3>
          <CatalogImport rates={company.vat_rates} current={company.catalog} saving={save.isPending} onSave={(items) => save.mutate(items)} />
        </Card>
      )}
    </section>
  );
}

function TokenPaste() {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [stored, setStored] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after mount
  useEffect(() => setStored(!!getToken()), []);
  return (
    <Group
      title="API token"
      description="Only needed when the server runs with SELECT_AUTH_MODE=token. Kept in this browser only, never sent anywhere else."
      footer={
        <Button size="sm" onClick={() => { setToken(value.trim() || null); setStored(!!value.trim()); setValue(""); toast.show({ tone: "success", title: value.trim() ? "Token saved in this browser" : "Token removed" }); }}>
          {value.trim() ? "Save token" : "Remove token"}
        </Button>
      }
    >
      <Row label="Token" htmlFor="token" hint={stored ? "A token is stored in this browser." : "Create one with: select-api create-token"}>
        <Input id="token" type="password" autoComplete="off" placeholder={stored ? "••••••••" : "sel_…"} value={value} onChange={(e) => setValue(e.target.value)} />
      </Row>
    </Group>
  );
}

const SECTIONS = [
  { id: "general", label: "General", icon: Building2 },
  { id: "automation", label: "Automation", icon: Workflow },
  { id: "people", label: "People", icon: Users },
  { id: "autonomy", label: "Autonomy policy", icon: ShieldCheck },
  { id: "catalog", label: "Catalog", icon: Package },
  { id: "account", label: "Your account", icon: UserRound },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** The other pages of the Settings place. */
const MORE = [
  { href: "connections", label: "Connections", icon: Plug },
  { href: "costs", label: "Costs", icon: CircleDollarSign },
  { href: "verification", label: "Verification", icon: BadgeCheck },
  { href: "activity", label: "Activity log", icon: Activity },
] as const;

function SettingsInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("section") === "access" ? "account" : params.get("section");
  const section: SectionId = SECTIONS.some((s) => s.id === requested) ? (requested as SectionId) : "general";
  const go = (id: SectionId) => router.replace(`/c/${cid}/settings?section=${id}`, { scroll: false });

  if (company.isPending) return <LoadingRows rows={8} />;
  if (company.isError) return <ErrorState error={company.error} retry={() => void company.refetch()} />;
  const c = company.data;
  const canAdmin = c.role === "owner" || c.role === "admin";
  return (
    <>
      <PageHeader title="Settings" />
      <PageBody className="grid max-w-5xl gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:space-y-0">
        <nav aria-label="Settings sections" className="md:sticky md:top-0 md:self-start">
          <ul className="scrollbar-none flex gap-1 overflow-x-auto md:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={section === s.id ? "page" : undefined}
                  className={cx(
                    "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-compact font-medium whitespace-nowrap transition-colors duration-[120ms]",
                    section === s.id ? "bg-[rgb(255_255_255/0.075)] font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <s.icon className={cx("size-4", section === s.id ? "text-accent" : "text-faint")} aria-hidden />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 mb-1 hidden px-2.5 font-mono text-nano font-medium tracking-widest text-muted uppercase md:block">More</p>
          <ul className="scrollbar-none mt-1 flex gap-1 overflow-x-auto md:mt-0 md:flex-col">
            {MORE.map((m) => (
              <li key={m.href}>
                <Link href={`/c/${cid}/${m.href}`} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-compact whitespace-nowrap text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-fg">
                  <m.icon className="size-4 text-faint" aria-hidden />
                  {m.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {!canAdmin && <p className="rounded-xl border border-line-soft px-4 py-2.5 text-xs text-muted">Read-only: only an owner or admin can change these settings.</p>}
          {section === "general" && <GeneralSection key={`${c.name}-${c.monthly_budget}-${c.vat_rates.join()}-${c.timezone}`} company={c} canAdmin={canAdmin} />}
          {section === "automation" && <AutomationSection key={JSON.stringify(c.settings)} company={c} canAdmin={canAdmin} />}
          {section === "people" && <PeopleSection company={c} />}
          {section === "autonomy" && <PolicySection company={c} canAdmin={canAdmin} />}
          {section === "catalog" && <CatalogSection key={`${c.catalog.length}-${c.catalog.map((i) => i.ref).join()}`} company={c} canAdmin={canAdmin} />}
          {section === "account" && <AccountSection />}
        </div>
      </PageBody>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <SettingsInner />
    </Suspense>
  );
}
