"use client";

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

import { Button, Segmented, Textarea, cx } from "@/components/ui/primitives";
import { fractionFromPercent, ratePercent } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";

const HEADERS: Record<keyof CatalogItem, string[]> = {
  ref: ["ref", "reference", "référence", "referenz", "sku", "code", "artikelnummer"],
  label: ["label", "libellé", "libelle", "name", "nom", "description", "bezeichnung", "designation", "désignation"],
  unit: ["unit", "unité", "unite", "einheit"],
  unit_price: ["unit_price", "price", "prix", "prix unitaire", "prix_unitaire", "preis", "einzelpreis", "prix ht"],
  vat_rate: ["vat", "vat_rate", "tva", "taux", "taux tva", "mwst", "ust"],
};

/** "1 234,50" or "1234.5" -> "1234.50"; null when it is not an amount. */
export function normalizeAmount(raw: string): string | null {
  let text = raw.trim().replace(/[€\s  ]/g, "").replace(/(CHF|EUR|MAD|DZD)$/i, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) text = text.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

function normalizeRate(raw: string, rates: string[]): string | null {
  const text = raw.trim().replace(",", ".");
  const asFraction = /%$/.test(text) || Number(text) >= 1 ? fractionFromPercent(text) : /^0?\.\d{1,4}$|^0$/.test(text) ? text : null;
  if (asFraction === null) return null;
  return rates.find((r) => Number(r) === Number(asFraction)) ?? null;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) { out.push(current); current = ""; } else current += ch;
  }
  out.push(current);
  return out.map((c) => c.trim());
}

/** Reads a catalog pasted from a spreadsheet or a CSV file (comma, semicolon or tab). */
export function parseCatalog(text: string, rates: string[]): { rows: CatalogItem[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0];
  if (first === undefined) return { rows: [], errors: [] };
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const head = splitLine(first, delimiter).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => HEADERS.ref.includes(h) || HEADERS.unit_price.includes(h));
  const order = (Object.keys(HEADERS) as (keyof CatalogItem)[]);
  const index: Record<keyof CatalogItem, number> = { ref: 0, label: 1, unit: 2, unit_price: 3, vat_rate: 4 };
  if (hasHeader) {
    for (const key of order) {
      const at = head.findIndex((h) => HEADERS[key].includes(h));
      if (at >= 0) index[key] = at;
    }
  }
  const rows: CatalogItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  lines.slice(hasHeader ? 1 : 0).forEach((line, i) => {
    const n = i + (hasHeader ? 2 : 1);
    const cells = splitLine(line, delimiter);
    const get = (key: keyof CatalogItem) => cells[index[key]] ?? "";
    const ref = get("ref");
    const price = normalizeAmount(get("unit_price"));
    const rate = normalizeRate(get("vat_rate") || (rates.length === 1 ? (rates[0] ?? "") : ""), rates);
    const problems: string[] = [];
    if (!/^[A-Za-z0-9_.-]{1,32}$/.test(ref)) problems.push("reference (letters, digits, - _ .)");
    if (!get("label") || get("label").length > 120) problems.push("label");
    if (!get("unit") || get("unit").length > 16) problems.push("unit");
    if (price === null) problems.push(`price "${get("unit_price")}"`);
    if (rate === null) problems.push(`VAT "${get("vat_rate")}" (company rates: ${rates.map(ratePercent).join(", ")})`);
    if (seen.has(ref)) problems.push("reference listed twice");
    if (problems.length) {
      errors.push(`Line ${n}: ${problems.join(", ")}`);
      return;
    }
    seen.add(ref);
    rows.push({ ref, label: get("label"), unit: get("unit"), unit_price: price!, vat_rate: rate! });
  });
  return { rows, errors };
}

/** Paste or upload a catalog, check every line against the company's VAT rates, then save it. */
export function CatalogImport({ rates, current, onSave, saving }: {
  rates: string[];
  current: CatalogItem[];
  onSave: (items: CatalogItem[]) => void;
  saving: boolean;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">(current.length ? "merge" : "replace");
  const file = useRef<HTMLInputElement>(null);
  const { rows, errors } = parseCatalog(text, rates);
  const merged = mode === "replace" ? rows : [...current.filter((c) => !rows.some((r) => r.ref === c.ref)), ...rows];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Columns: reference, label, unit, unit price, VAT ({rates.map(ratePercent).join(", ")}). A header line is optional; commas, semicolons and tabs all work.
        </p>
        <div className="flex items-center gap-2">
          <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Catalog file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
          <Button size="sm" icon={<FileUp className="size-3.5" aria-hidden />} onClick={() => file.current?.click()}>Choose a file</Button>
        </div>
      </div>
      <Textarea
        aria-label="Catalog lines"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"ref;label;unit;unit_price;vat\nPOSE-H;Pose, par heure;h;45,00;20 %\nPT-CHENE;Plan de travail chêne;m;189,00;20 %"}
        className="min-h-32 font-mono text-xs"
      />
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          {errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
          {errors.length > 8 && <li>{errors.length - 8} more line(s) with problems</li>}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line-soft">
          <table className="w-full min-w-[480px] text-xs">
            <caption className="sr-only">Lines read from the catalog</caption>
            <thead><tr className="border-b border-line-soft text-left text-faint">
              <th scope="col" className="px-3 py-1.5 font-medium">Ref</th><th scope="col" className="px-3 py-1.5 font-medium">Label</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Unit</th><th scope="col" className="px-3 py-1.5 text-right font-medium">Price</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">VAT</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.ref} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-1.5 font-mono">{r.ref}</td><td className="px-3 py-1.5">{r.label}</td><td className="px-3 py-1.5">{r.unit}</td>
                  <td className="px-3 py-1.5 text-right tabular">{r.unit_price}</td><td className="px-3 py-1.5 text-right tabular">{ratePercent(r.vat_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 12 && <p className="border-t border-line-soft px-3 py-1.5 text-xs text-faint">and {rows.length - 12} more</p>}
        </div>
      )}
      <div className={cx("flex flex-wrap items-center gap-3", current.length ? "justify-between" : "justify-end")}>
        {current.length > 0 && (
          <Segmented label="Import mode" value={mode} onChange={setMode} options={[{ value: "merge", label: "Add and update" }, { value: "replace", label: "Replace all" }]} />
        )}
        <Button variant="primary" size="sm" disabled={!rows.length || errors.length > 0} loading={saving} onClick={() => onSave(merged)}>
          {rows.length ? `Save ${merged.length} item${merged.length > 1 ? "s" : ""}` : "Save"}
        </Button>
      </div>
    </div>
  );
}
