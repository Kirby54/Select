"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Button, Card, CardHeader, Field, IconButton, Input, Select } from "@/components/ui/primitives";
import { api, getToken, setToken } from "@/lib/api";
import { useAction, useCompany, useCompanyId } from "@/lib/queries";
import type { CatalogItem, Company, Level } from "@/lib/types";

function TokenCard() {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [stored, setStored] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after mount
  useEffect(() => setStored(!!getToken()), []);
  return (
    <Card>
      <CardHeader title="API token" description="Only needed when the server runs with SELECT_AUTH_MODE=token. Kept in this browser only." />
      <div className="flex flex-col gap-2 p-4 sm:flex-row">
        <label htmlFor="token" className="sr-only">API token</label>
        <Input id="token" type="password" autoComplete="off" placeholder={stored ? "A token is stored in this browser" : "sel_…"} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button onClick={() => { setToken(value.trim() || null); setStored(!!value.trim()); setValue(""); toast.show({ tone: "success", title: value.trim() ? "Token saved in this browser" : "Token removed" }); }}>
          {value.trim() ? "Save token" : "Remove token"}
        </Button>
      </div>
    </Card>
  );
}

function PolicyCard({ company, canAdmin }: { company: Company; canAdmin: boolean }) {
  const p = company.policy;
  const [supervised, setSupervised] = useState(String(p.promote_after?.supervised ?? 20));
  const [sampled, setSampled] = useState(String(p.promote_after?.sampled ?? 50));
  const [rate, setRate] = useState(String(Math.round((p.sample_rate ?? 0.2) * 100)));
  const [caps, setCaps] = useState<Record<string, Level>>({ low: "autonomous", medium: "autonomous", high: "supervised", ...(p.max_level_by_risk ?? {}) });
  const save = useAction(company.id, (policy: Record<string, unknown>) => api(`/companies/${company.id}`, { method: "PATCH", body: { policy } }), { success: "Autonomy policy saved" });
  const valid = [supervised, sampled].every((v) => /^\d+$/.test(v) && Number(v) >= 1) && /^\d+$/.test(rate) && Number(rate) <= 100;
  return (
    <Card>
      <CardHeader title="Autonomy policy" description="Starting hypotheses, not proven values: calibrate them on your own results. Legal-risk work is always supervised and cannot be changed here." />
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Supervised → sampled after" htmlFor="p-sup" hint="verified successes in a row"><Input id="p-sup" inputMode="numeric" value={supervised} disabled={!canAdmin} onChange={(e) => setSupervised(e.target.value)} /></Field>
        <Field label="Sampled → autonomous after" htmlFor="p-sam" hint="verified successes in a row"><Input id="p-sam" inputMode="numeric" value={sampled} disabled={!canAdmin} onChange={(e) => setSampled(e.target.value)} /></Field>
        <Field label="Sampled review rate" htmlFor="p-rate" hint="% of results reviewed at the sampled level"><Input id="p-rate" inputMode="numeric" value={rate} disabled={!canAdmin} onChange={(e) => setRate(e.target.value)} /></Field>
        {(["low", "medium", "high"] as const).map((risk) => (
          <Field key={risk} label={`Highest level for ${risk}-risk work`} htmlFor={`cap-${risk}`}>
            <Select id={`cap-${risk}`} value={caps[risk]} disabled={!canAdmin} onChange={(e) => setCaps({ ...caps, [risk]: e.target.value as Level })}>
              <option value="supervised">Supervised</option><option value="sampled">Sampled</option><option value="autonomous">Autonomous</option>
            </Select>
          </Field>
        ))}
      </div>
      {canAdmin && (
        <div className="flex justify-end border-t border-line px-4 py-2.5">
          <Button size="sm" variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate({
            promote_after: { supervised: Number(supervised), sampled: Number(sampled) },
            sample_rate: Number(rate) / 100,
            max_level_by_risk: caps,
          })}>Save policy</Button>
        </div>
      )}
    </Card>
  );
}

function CatalogCard({ company, canAdmin }: { company: Company; canAdmin: boolean }) {
  const [rows, setRows] = useState<CatalogItem[]>(company.catalog);
  const save = useAction(company.id, (items: CatalogItem[]) => api(`/companies/${company.id}/catalog`, { method: "PUT", body: items as unknown as Record<string, unknown>[] }), { success: "Catalog saved" });
  const update = (i: number, patch: Partial<CatalogItem>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const invalid = rows.some((r) => !r.ref.trim() || !r.label.trim() || !r.unit.trim() || !/^\d+(\.\d{1,2})?$/.test(r.unit_price));
  return (
    <Card>
      <CardHeader title="Catalog" description="The only source of prices for quotes and invoices. A price outside the catalog fails verification." />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Catalog items</caption>
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-medium">Ref</th><th scope="col" className="px-2 py-2 font-medium">Label</th><th scope="col" className="px-2 py-2 font-medium">Unit</th>
            <th scope="col" className="px-2 py-2 font-medium">Unit price</th><th scope="col" className="px-2 py-2 font-medium">VAT</th><th scope="col" className="px-4 py-2"><span className="sr-only">Remove</span></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="px-4 py-1.5"><Input aria-label="Reference" value={r.ref} disabled={!canAdmin} onChange={(e) => update(i, { ref: e.target.value })} className="h-8 font-mono text-xs" /></td>
                <td className="px-2 py-1.5"><Input aria-label="Label" value={r.label} disabled={!canAdmin} onChange={(e) => update(i, { label: e.target.value })} className="h-8 text-xs" /></td>
                <td className="px-2 py-1.5"><Input aria-label="Unit" value={r.unit} disabled={!canAdmin} onChange={(e) => update(i, { unit: e.target.value })} className="h-8 w-20 text-xs" /></td>
                <td className="px-2 py-1.5"><Input aria-label="Unit price" inputMode="decimal" value={r.unit_price} disabled={!canAdmin} onChange={(e) => update(i, { unit_price: e.target.value })} className="h-8 w-28 text-right text-xs tabular" /></td>
                <td className="px-2 py-1.5">
                  <Select aria-label="VAT rate" value={r.vat_rate} disabled={!canAdmin} onChange={(e) => update(i, { vat_rate: e.target.value })} className="h-8 w-24 text-xs">
                    <option value="0.19">19 %</option><option value="0.07">7 %</option><option value="0">0 %</option>
                  </Select>
                </td>
                <td className="px-4 py-1.5 text-right">{canAdmin && <IconButton label={`Remove ${r.ref || "row"}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-3.5" aria-hidden /></IconButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAdmin && (
        <div className="flex justify-between border-t border-line px-4 py-2.5">
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setRows([...rows, { ref: "", label: "", unit: "pc", unit_price: "0.00", vat_rate: "0.19" }])}>Add item</Button>
          <Button size="sm" variant="primary" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(rows)}>Save catalog</Button>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const save = useAction(cid, (body: Record<string, unknown>) => api(`/companies/${cid}`, { method: "PATCH", body }), { success: "Company saved" });
  useEffect(() => {
    if (company.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise the form once data arrives
      setName(company.data.name);
      setBudget(company.data.monthly_budget);
    }
  }, [company.data]);
  if (company.isPending) return <LoadingRows rows={8} />;
  if (company.isError) return <ErrorState error={company.error} retry={() => void company.refetch()} />;
  const c = company.data;
  const canAdmin = c.role === "owner" || c.role === "admin";
  return (
    <>
      <PageHeader title="Settings" description={`You are ${c.role} of this company.`} />
      <PageBody className="max-w-4xl">
        <Card>
          <CardHeader title="Company" />
          <form className="grid gap-4 p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); save.mutate({ name: name.trim(), monthly_budget: budget.trim() }); }}>
            <Field label="Name" htmlFor="s-name" error={!name.trim() ? "A name is required" : undefined}><Input id="s-name" value={name} disabled={!canAdmin} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Monthly budget" htmlFor="s-budget" hint="Live runs stop when reached" error={budget && !/^\d+(\.\d{1,2})?$/.test(budget) ? "Use a number such as 200.00" : undefined}>
              <Input id="s-budget" inputMode="decimal" value={budget} disabled={!canAdmin} onChange={(e) => setBudget(e.target.value)} />
            </Field>
            {canAdmin && <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim() || !/^\d+(\.\d{1,2})?$/.test(budget)} className="sm:mb-[22px]">Save</Button>}
          </form>
        </Card>
        <PolicyCard company={c} canAdmin={canAdmin} />
        <CatalogCard key={c.catalog.length} company={c} canAdmin={canAdmin} />
        <TokenCard />
      </PageBody>
    </>
  );
}
