"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, Circle, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";

import { CatalogImport } from "@/components/catalog-import";
import { MailboxForm } from "@/components/mailbox-form";
import { ProviderSetup } from "@/components/provider-setup";
import { Logo } from "@/components/shell/logo";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Badge, Button, Card, Field, Input, Select, cx } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { fractionFromPercent, ratePercent, taskTypeLabel } from "@/lib/format";
import { useAgents, useCompany, useCountries, useMailboxes, useTemplates } from "@/lib/queries";
import type { Company, CountryPreset, Language } from "@/lib/types";

const STEPS = [
  { id: "company", label: "Company", hint: "Country, VAT, language" },
  { id: "team", label: "Team", hint: "A starting set of agents" },
  { id: "model", label: "AI model", hint: "Your provider key" },
  { id: "mailbox", label: "Mailbox", hint: "Read and send e-mail" },
  { id: "catalog", label: "Catalog", hint: "Prices for quotes" },
  { id: "done", label: "Ready", hint: "What works now" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
];
const ZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Luxembourg", "Europe/Zurich", "Europe/Berlin", "Africa/Casablanca", "Africa/Algiers", "Africa/Tunis", "Europe/London", "America/Montreal", "UTC"];

function Rail({ current, companyId }: { current: StepId; companyId: string | null }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0" aria-label="Setup steps">
      {STEPS.map((s, i) => {
        const done = i < index;
        const active = s.id === current;
        const reachable = companyId !== null && i > 0;
        const content = (
          <>
            <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold", done ? "bg-autonomous/15 text-autonomous" : active ? "bg-accent text-on-accent" : "bg-surface-2 text-faint")}>
              {done ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cx("block text-[13px] whitespace-nowrap", active ? "font-medium text-fg" : "text-muted")}>{s.label}</span>
              <span className="hidden text-xs text-faint md:block">{s.hint}</span>
            </span>
          </>
        );
        return (
          <li key={s.id} aria-current={active ? "step" : undefined}>
            {reachable && !active ? (
              <Link href={`/new?c=${companyId}&step=${s.id}`} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-hover">{content}</Link>
            ) : (
              <div className={cx("flex items-start gap-2.5 rounded-lg px-2 py-1.5", active && "bg-[rgb(255_255_255/0.05)]")}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepFrame({ title, description, children, footer }: { title: string; description: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="flex flex-col">
      <div className="border-b border-line-soft px-4 py-4 sm:px-5">
        <h1 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft bg-canvas/30 px-4 py-3 sm:px-5">{footer}</div>}
    </Card>
  );
}

function CompanyStep({ onCreated }: { onCreated: (company: Company) => void }) {
  const countries = useCountries();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("FR");
  const [language, setLanguage] = useState<Language>("fr");
  const [currency, setCurrency] = useState("EUR");
  const [rates, setRates] = useState("20, 10, 5.5, 2.1, 0");
  const [zone, setZone] = useState("Europe/Paris");
  const [budget, setBudget] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (code: string) => {
    setCountry(code);
    const preset: CountryPreset | undefined = countries.data?.find((c) => c.code === code);
    if (preset) {
      setCurrency(preset.currency);
      setRates(preset.vat_rates.map((r) => ratePercent(r).replace(" %", "")).join(", "));
      setZone(preset.timezone);
      setLanguage(preset.language);
    }
  };

  const submit = async () => {
    const fractions = rates.split(/[,;\s]+/).filter(Boolean).map(fractionFromPercent);
    if (!name.trim()) return setError("Give your company a name.");
    if (!fractions.length || fractions.some((f) => f === null)) return setError("Write VAT rates as percentages, for example: 20, 10, 5.5, 0");
    if (!/^[A-Z]{3}$/.test(currency)) return setError("The currency is a three-letter code such as EUR.");
    if (!/^\d+(\.\d{1,2})?$/.test(budget.trim())) return setError("Write the monthly budget as a number, for example 50.");
    setBusy(true);
    setError(null);
    try {
      const preset = countries.data?.find((c) => c.code === country);
      const company = await api<Company>("/companies", {
        method: "POST",
        body: {
          name: name.trim(),
          country: preset ? country : "ZZ",
          currency,
          vat_rates: fractions as string[],
          timezone: zone.trim(),
          language,
          monthly_budget: budget.trim(),
        },
      });
      onCreated(company);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const preset = countries.data?.find((c) => c.code === country);
  return (
    <StepFrame
      title="Your company"
      description="The country sets the VAT rates every quote is checked against, the currency, the time zone of routines and the language agents write in by default."
      footer={<><span className="text-xs text-faint">{preset ? `VAT presets checked on ${preset.checked_on}. Check them with your accountant.` : "Enter your own rates."}</span><Button variant="primary" loading={busy} onClick={() => void submit()}>Create the company</Button></>}
    >
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><Field label="Company name" htmlFor="c-name"><Input id="c-name" autoComplete="organization" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
        <Field label="Country" htmlFor="c-country">
          <Select id="c-country" value={country} onChange={(e) => choose(e.target.value)}>
            {(countries.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            <option value="ZZ">Another country</option>
          </Select>
        </Field>
        <Field label="Language for customers" htmlFor="c-lang" hint="Agents answer in the customer's language when they can tell.">
          <Select id="c-lang" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
        </Field>
        <Field label="VAT rates (%)" htmlFor="c-vat" hint="Separated by commas. Quotes using any other rate fail verification.">
          <Input id="c-vat" value={rates} onChange={(e) => setRates(e.target.value)} className="tabular" />
        </Field>
        <Field label="Currency" htmlFor="c-cur"><Input id="c-cur" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
        <Field label="Time zone" htmlFor="c-tz">
          <Input id="c-tz" list="zones" value={zone} onChange={(e) => setZone(e.target.value)} />
        </Field>
        <datalist id="zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
        <Field label="Monthly AI budget" htmlFor="c-budget" hint="In USD, like provider prices. Live runs stop when it is reached; 0 = no limit.">
          <Input id="c-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="tabular" />
        </Field>
      </form>
    </StepFrame>
  );
}

function TeamStep({ company, next }: { company: Company; next: () => void }) {
  const templates = useTemplates(company.language);
  const agents = useAgents(company.id);
  const [chosen, setChosen] = useState("artisan");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const client = useQueryClient();
  if (templates.isPending || agents.isPending) return <Card><LoadingRows rows={4} /></Card>;
  if (templates.isError) return <Card><ErrorState error={templates.error} retry={() => void templates.refetch()} /></Card>;
  const existing = agents.data ?? [];
  const apply = async () => {
    if (chosen === "blank") return next();
    setBusy(true);
    try {
      const result = await api<{ agents: number; routines: number }>(`/companies/${company.id}/apply-template`, { method: "POST", body: { template: chosen } });
      toast.show({ tone: "success", title: `${result.agents} agents created` });
      await client.invalidateQueries({ queryKey: ["c", company.id] });
      next();
    } catch (e) {
      toast.show({ tone: "error", title: errorMessage(e) });
      setBusy(false);
    }
  };
  if (existing.length > 0) {
    return (
      <StepFrame title="Your team" description="This company already has agents. Change them any time in Agents and Organization." footer={<><span /><Button variant="primary" onClick={next}>Continue</Button></>}>
        <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
          {existing.map((a) => <li key={a.id} className="flex items-center justify-between px-3 py-2 text-[13px]"><span>{a.name}</span><span className="text-xs text-faint">{a.role}</span></li>)}
        </ul>
      </StepFrame>
    );
  }
  return (
    <StepFrame
      title="Choose a starting team"
      description="Each agent gets a role, instructions in your language and the task types it may do. Nothing is sent before a person approves it: an agent earns autonomy task type by task type."
      footer={<><span className="text-xs text-faint">Everything stays editable afterwards.</span><Button variant="primary" loading={busy} onClick={() => void apply()}>{chosen === "blank" ? "Continue without agents" : "Create this team"}</Button></>}
    >
      <div role="radiogroup" aria-label="Team templates" className="grid gap-3 lg:grid-cols-2">
        {(templates.data ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={chosen === t.id}
            onClick={() => setChosen(t.id)}
            className={cx("rounded-xl border p-3.5 text-left transition-colors duration-[120ms]", chosen === t.id ? "border-accent/60 bg-selected" : "border-line-soft hover:bg-hover")}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-fg">{t.name}</span>
              {chosen === t.id ? <CheckCircle2 className="size-4 text-accent" aria-hidden /> : <Circle className="size-4 text-ghost" aria-hidden />}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{t.description}</span>
            {t.agents.length > 0 && (
              <span className="mt-2.5 flex flex-wrap gap-1.5">
                {t.agents.map((a) => (
                  <span key={a.name} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted" title={a.task_types.map(taskTypeLabel).join(", ")}>{a.name}</span>
                ))}
              </span>
            )}
            {t.routines.length > 0 && <span className="mt-2 block text-xs text-faint">Routine, off until you turn it on: {t.routines.join(", ")}</span>}
          </button>
        ))}
      </div>
    </StepFrame>
  );
}

function ModelStep({ company, next }: { company: Company; next: () => void }) {
  const toast = useToast();
  return (
    <StepFrame
      title="Connect an AI model"
      description="Agents call the provider with your own key. Select checks the key by listing the provider's models; no company data is sent for that."
      footer={<><span className="text-xs text-faint">Without a model, agents stay “not connected” and tasks wait.</span><Button variant="ghost" onClick={next}>Later</Button></>}
    >
      <ProviderSetup cid={company.id} onDone={(r) => { toast.show({ tone: "success", title: `${r.changed} agents use ${r.model}` }); next(); }} />
    </StepFrame>
  );
}

function MailboxStep({ company, next }: { company: Company; next: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <StepFrame
      title="Connect the company mailbox"
      description="Incoming mail becomes triage tasks; approved replies leave from this address. A connection test logs in and sends nothing."
      footer={<><span className="text-xs text-faint">You can connect more mailboxes in Connections.</span><Button variant={ok ? "primary" : "ghost"} onClick={next}>{ok ? "Continue" : "Later"}</Button></>}
    >
      <MailboxForm cid={company.id} companyName={company.name} submitLabel="Connect and test" onSaved={(_m, test) => setOk(!!(test.imap?.ok || test.smtp?.ok))} />
    </StepFrame>
  );
}

function CatalogStep({ company, next }: { company: Company; next: () => void }) {
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const client = useQueryClient();
  const save = async (items: Company["catalog"]) => {
    setSaving(true);
    try {
      await api(`/companies/${company.id}/catalog`, { method: "PUT", body: items as unknown as Record<string, unknown>[] });
      await client.invalidateQueries({ queryKey: ["c", company.id] });
      toast.show({ tone: "success", title: `Catalog saved: ${items.length} items` });
      next();
    } catch (e) {
      toast.show({ tone: "error", title: errorMessage(e) });
      setSaving(false);
    }
  };
  return (
    <StepFrame
      title="Your catalog"
      description="Quotes take every price from here and nowhere else: a price the agent writes that is not in the catalog fails verification."
      footer={<><span className="text-xs text-faint">{company.catalog.length ? `${company.catalog.length} items already saved.` : "No catalog: quotes cannot be priced."}</span><Button variant="ghost" onClick={next}>Later</Button></>}
    >
      <CatalogImport rates={company.vat_rates} current={company.catalog} saving={saving} onSave={(items) => void save(items)} />
    </StepFrame>
  );
}

function DoneStep({ company }: { company: Company }) {
  const agents = useAgents(company.id);
  const mailboxes = useMailboxes(company.id);
  const router = useRouter();
  const list = agents.data ?? [];
  const connected = list.filter((a) => a.connected).length;
  const reading = (mailboxes.data ?? []).some((m) => m.inbound_enabled && m.last_poll_ok !== false);
  const sending = (mailboxes.data ?? []).some((m) => m.outbound_enabled && m.last_smtp_test_ok);
  const rows: { ok: boolean; title: string; detail: string; href: string }[] = [
    { ok: list.length > 0, title: list.length ? `${list.length} agents` : "No agent yet", detail: list.length ? "Each starts supervised and earns autonomy from verified results." : "Create one in Agents.", href: "agents" },
    { ok: list.length > 0 && connected === list.length, title: connected ? `${connected} of ${list.length} agents can run` : "No model connected", detail: connected ? "Tasks start as soon as they are assigned." : "Tasks wait until a provider is connected in Connections.", href: "connections" },
    { ok: reading, title: reading ? "Reading incoming mail" : "Not reading mail", detail: reading ? "New e-mails become triage tasks within a few minutes." : "Connect a mailbox in Connections, or create tasks by hand.", href: "connections" },
    { ok: sending, title: sending ? "Sending approved replies" : "Not sending mail", detail: sending ? "Every reply waits for approval until an agent's record earns it the right." : "Approved replies are kept ready to copy until a mailbox can send.", href: "connections" },
    { ok: company.catalog.length > 0, title: company.catalog.length ? `${company.catalog.length} catalog items` : "Empty catalog", detail: company.catalog.length ? "Quotes are priced from it and checked against it." : "Quotes cannot be priced yet.", href: "settings?section=catalog" },
  ];
  return (
    <StepFrame
      title={`${company.name} is set up`}
      description="This is what works now. Anything marked with a warning can be finished later; the link opens the right page."
      footer={<><span /><Button variant="primary" icon={<ArrowRight className="size-3.5" aria-hidden />} onClick={() => router.push(`/c/${company.id}/overview`)}>Open {company.name}</Button></>}
    >
      <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
        {rows.map((r) => (
          <li key={r.title}>
            <Link href={`/c/${company.id}/${r.href}`} className="flex items-start gap-3 px-3.5 py-3 hover:bg-hover">
              {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-autonomous" aria-label="Ready" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="To finish" />}
              <span className="min-w-0">
                <span className="block text-[13px] text-fg">{r.title}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </StepFrame>
  );
}

function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const cid = params.get("c");
  const requested = params.get("step") as StepId | null;
  const step: StepId = cid ? (STEPS.some((s) => s.id === requested) && requested !== "company" ? requested! : "team") : "company";
  const company = useCompany(cid ?? "", cid !== null);
  const go = (id: StepId, companyId = cid) => router.push(`/new?c=${companyId}&step=${id}`);
  const nextOf = (id: StepId) => STEPS[STEPS.findIndex((s) => s.id === id) + 1]?.id ?? "done";

  let body: ReactNode;
  if (step === "company") body = <CompanyStep onCreated={(c) => go("team", c.id)} />;
  else if (company.isPending) body = <Card><LoadingRows rows={5} /></Card>;
  else if (company.isError) body = <Card><ErrorState error={company.error} retry={() => void company.refetch()} /></Card>;
  else {
    const c = company.data;
    const next = () => go(nextOf(step));
    body =
      step === "team" ? <TeamStep company={c} next={next} /> :
      step === "model" ? <ModelStep company={c} next={next} /> :
      step === "mailbox" ? <MailboxStep company={c} next={next} /> :
      step === "catalog" ? <CatalogStep company={c} next={next} /> :
      <DoneStep company={c} />;
  }

  return (
    <main id="main" className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl animate-rise-in">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Select home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-fg text-canvas"><Logo className="size-4" title="" /></span>
            <span className="text-[14px] font-semibold">Set up a company</span>
          </Link>
          {company.data && <Badge tone="accent">{company.data.name}</Badge>}
        </div>
        <div className="grid gap-5 md:grid-cols-[210px_minmax(0,1fr)]">
          <nav aria-label="Progress" className="md:sticky md:top-8 md:self-start"><Rail current={step} companyId={cid} /></nav>
          <div className="min-w-0">{body}</div>
        </div>
      </div>
    </main>
  );
}

export default function NewCompanyPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <Wizard />
    </Suspense>
  );
}
