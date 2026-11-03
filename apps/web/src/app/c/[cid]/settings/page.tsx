"use client";

import { Building2, KeyRound, Lock, Package, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { AutonomyLevel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Button, Card, IconButton, Input, Select, cx } from "@/components/ui/primitives";
import { api, getToken, setToken } from "@/lib/api";
import { useAction, useCompany, useCompanyId } from "@/lib/queries";
import type { CatalogItem, Company, Level } from "@/lib/types";

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
  const [name, setName] = useState(company.name);
  const [budget, setBudget] = useState(company.monthly_budget);
  const save = useAction(company.id, (body: Record<string, unknown>) => api(`/companies/${company.id}`, { method: "PATCH", body }), { success: "Company saved" });
  const budgetValid = /^\d+(\.\d{1,2})?$/.test(budget);
  const dirty = name !== company.name || budget !== company.monthly_budget;
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate({ name: name.trim(), monthly_budget: budget.trim() }); }}>
      <Group
        title="Company"
        description="Name and the spending limit that stops live runs."
        footer={canAdmin ? <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!dirty || !name.trim() || !budgetValid}>Save</Button> : undefined}
      >
        <Row label="Name" htmlFor="s-name" error={!name.trim() ? "A name is required" : undefined}>
          <Input id="s-name" value={name} disabled={!canAdmin} onChange={(e) => setName(e.target.value)} />
        </Row>
        <Row label="Monthly budget" htmlFor="s-budget" hint={`In ${company.currency}. Live runs stop when it is reached; 0 means no limit.`} error={budget && !budgetValid ? "Use a number such as 200.00" : undefined}>
          <Input id="s-budget" inputMode="decimal" value={budget} disabled={!canAdmin} onChange={(e) => setBudget(e.target.value)} className="text-right tabular" />
        </Row>
        <Row label="Your role"><span className="text-[13px] text-muted capitalize">{company.role}</span></Row>
        <Row label="Kind of company"><span className="text-[13px] text-muted">{company.is_demo ? "Demo (recorded outputs, no model is called)" : "Live"}</span></Row>
      </Group>
    </form>
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
                      <option value="0.19">19 %</option><option value="0.07">7 %</option><option value="0">0 %</option>
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
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setRows([...rows, { ref: "", label: "", unit: "pc", unit_price: "0.00", vat_rate: "0.19" }])}>Add item</Button>
            <Button size="sm" variant="primary" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(rows)}>Save catalog</Button>
          </div>
        )}
      </Card>
    </section>
  );
}

function AccessSection() {
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
  { id: "autonomy", label: "Autonomy policy", icon: ShieldCheck },
  { id: "catalog", label: "Catalog", icon: Package },
  { id: "access", label: "API access", icon: KeyRound },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function SettingsInner() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("section");
  const section: SectionId = SECTIONS.some((s) => s.id === requested) ? (requested as SectionId) : "general";
  const go = (id: SectionId) => router.replace(`/c/${cid}/settings?section=${id}`, { scroll: false });

  if (company.isPending) return <LoadingRows rows={8} />;
  if (company.isError) return <ErrorState error={company.error} retry={() => void company.refetch()} />;
  const c = company.data;
  const canAdmin = c.role === "owner" || c.role === "admin";
  return (
    <>
      <PageHeader title="Settings" description={`You are ${c.role} of this company`} />
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
                    "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] whitespace-nowrap transition-colors duration-[120ms]",
                    section === s.id ? "bg-[rgb(255_255_255/0.075)] font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <s.icon className={cx("size-4", section === s.id ? "text-accent" : "text-faint")} aria-hidden />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {!canAdmin && <p className="rounded-xl border border-line-soft px-4 py-2.5 text-xs text-muted">Read-only: only an owner or admin can change these settings.</p>}
          {section === "general" && <GeneralSection key={`${c.name}-${c.monthly_budget}`} company={c} canAdmin={canAdmin} />}
          {section === "autonomy" && <PolicySection company={c} canAdmin={canAdmin} />}
          {section === "catalog" && <CatalogSection key={c.catalog.length} company={c} canAdmin={canAdmin} />}
          {section === "access" && <AccessSection />}
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
