"use client";

import { BadgeCheck, FileCode2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ReceiptStatus, VerificationReceipt } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable, Pagination, TabPanel, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Badge, Card, Select } from "@/components/ui/primitives";
import { relative, taskTypeLabel } from "@/lib/format";
import { useCompanyId, useContracts, useReceipts } from "@/lib/queries";
import type { ContractView, Receipt } from "@/lib/types";

const RISK_TONE = { low: "neutral", medium: "accent", high: "warning", legal: "danger" } as const;

export default function VerificationPage() {
  const cid = useCompanyId();
  const contracts = useContracts(cid);
  const [tab, setTab] = useState("contracts");
  const [status, setStatus] = useState("");
  const [contract, setContract] = useState("");
  const [offset, setOffset] = useState(0);
  const receipts = useReceipts(cid, { status: status || undefined, contract: contract || undefined, offset });
  const [openContract, setOpenContract] = useState<ContractView | null>(null);
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);

  return (
    <>
      <PageHeader title="Verification" description="Delivery contracts say what a correct result is. The system runs every check itself and keeps a receipt." />
      <PageBody>
        <Card>
          <Tabs value={tab} onValueChange={setTab} label="Verification sections" tabs={[
            { value: "contracts", label: "Contracts", count: contracts.data?.length },
            { value: "receipts", label: "Receipts", count: receipts.data?.total },
          ]}>
            <TabPanel value="contracts">
              {contracts.isPending ? <LoadingRows /> : contracts.isError ? <ErrorState error={contracts.error} retry={() => void contracts.refetch()} /> : (
                <DataTable
                  caption="Delivery contracts"
                  rows={contracts.data}
                  rowKey={(c) => c.id}
                  rowLabel={(c) => c.title}
                  onRowClick={setOpenContract}
                  columns={[
                    { key: "title", header: "Contract", cell: (c) => <span><span className="text-fg">{c.title}</span> <span className="font-mono text-xs text-faint">{c.id} v{c.version}</span></span> },
                    { key: "risk", header: "Risk", cell: (c) => <Badge tone={RISK_TONE[c.risk]}>{c.risk}</Badge> },
                    { key: "checks", header: "Checks", cell: (c) => <span className="text-muted tabular">{c.checks.length}</span>, align: "right" },
                    { key: "approval", header: "Human approval", cell: (c) => <span className="text-xs text-muted">{c.approval.mode === "always" ? "Always" : `By autonomy, up to ${c.cap}`}</span>, hideOnMobile: true },
                    { key: "receipts", header: "Receipts", cell: (c) => <span className="text-xs text-muted tabular">{c.receipts.verified ?? 0} ok · {c.receipts.failed ?? 0} failed · {c.receipts.blocked ?? 0} blocked</span> },
                  ]}
                />
              )}
            </TabPanel>
            <TabPanel value="receipts">
              <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
                <label htmlFor="r-status" className="sr-only">Status</label>
                <Select id="r-status" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="h-8 w-36 text-xs">
                  <option value="">All statuses</option><option value="verified">Verified</option><option value="failed">Failed</option><option value="blocked">Blocked</option>
                </Select>
                <label htmlFor="r-contract" className="sr-only">Contract</label>
                <Select id="r-contract" value={contract} onChange={(e) => { setContract(e.target.value); setOffset(0); }} className="h-8 w-44 text-xs">
                  <option value="">All contracts</option>
                  {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{taskTypeLabel(c.id)}</option>)}
                </Select>
              </div>
              {receipts.isPending ? <LoadingRows /> : receipts.isError ? <ErrorState error={receipts.error} retry={() => void receipts.refetch()} /> : (
                <>
                  <DataTable
                    caption="Receipts"
                    rows={receipts.data.items}
                    rowKey={(r) => r.id}
                    rowLabel={(r) => `Receipt for ${r.task_key}`}
                    onRowClick={setOpenReceipt}
                    empty={<EmptyState icon={<BadgeCheck />} title="No receipt" description="Receipts appear as soon as results are verified." />}
                    columns={[
                      { key: "task", header: "Task", cell: (r) => <span><span className="font-mono text-xs text-faint">{r.task_key}</span> <span className="text-fg">{r.task_title}</span></span> },
                      { key: "status", header: "Result", cell: (r) => <ReceiptStatus status={r.status} /> },
                      { key: "contract", header: "Contract", cell: (r) => <span className="font-mono text-xs text-muted">{r.contract_id} v{r.contract_version}</span>, hideOnMobile: true },
                      { key: "agent", header: "Agent", cell: (r) => <span className="text-muted">{r.agent_name ?? "—"}</span> },
                      { key: "when", header: "When", cell: (r) => <span className="text-muted">{relative(r.created_at)}</span>, align: "right" },
                    ]}
                  />
                  <Pagination total={receipts.data.total} limit={50} offset={offset} onChange={setOffset} />
                </>
              )}
            </TabPanel>
          </Tabs>
        </Card>
      </PageBody>
      <DetailPanel open={!!openContract} onOpenChange={(o) => !o && setOpenContract(null)} title={openContract?.title ?? ""} subtitle={openContract ? `${openContract.id} v${openContract.version} · sha256 ${openContract.sha256.slice(0, 12)}` : undefined}>
        {openContract && (
          <div className="space-y-5 p-5">
            <p className="text-sm text-muted">{openContract.description}</p>
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted">Checks run by the system</h3>
              <ul className="space-y-2">
                {openContract.checks.map((ch) => (
                  <li key={ch.id} className="rounded-md border border-line p-2.5">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{ch.id}</span><Badge>{ch.rule}</Badge>{!ch.blocking && <Badge>non-blocking</Badge>}</div>
                    {ch.description && <p className="mt-1 text-xs text-muted">{ch.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted"><FileCode2 className="size-3.5" aria-hidden />Source (contracts/{openContract.id}.yaml)</h3>
              <pre className="max-h-96 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs leading-relaxed text-muted">{openContract.source}</pre>
            </section>
          </div>
        )}
      </DetailPanel>
      <DetailPanel open={!!openReceipt} onOpenChange={(o) => !o && setOpenReceipt(null)} title={openReceipt ? `Receipt · ${openReceipt.task_key}` : ""} subtitle={openReceipt?.task_title ?? undefined}
        actions={openReceipt && <Link href={`/c/${cid}/tasks/${openReceipt.task_id}`} className="text-xs text-accent hover:text-accent-strong">Open task</Link>}>
        {openReceipt && <div className="p-5"><VerificationReceipt receipt={openReceipt} /></div>}
      </DetailPanel>
    </>
  );
}
