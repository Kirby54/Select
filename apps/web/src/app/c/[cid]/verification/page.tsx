"use client";

import { ArrowRight, BadgeCheck, ChevronDown, FileCode2, ListChecks, Receipt as ReceiptIcon, Send } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { AutonomyLevel, ReceiptStatus, VerificationReceipt } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { DataTable, Pagination, TabPanel, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Badge, Card, DemoTag, Segmented, Select, cx } from "@/components/ui/primitives";
import { relative, taskTypeLabel } from "@/lib/format";
import { useCompanyId, useContracts, useReceipts } from "@/lib/queries";
import type { ContractView, Receipt } from "@/lib/types";

const RISK_TONE = { low: "neutral", medium: "neutral", high: "warning", legal: "danger" } as const;

/** How a result becomes a receipt, as four steps with the company's real numbers. */
function Pipeline({ contracts }: { contracts: ContractView[] }) {
  const sum = (k: "verified" | "failed" | "blocked") => contracts.reduce((n, c) => n + (c.receipts[k] ?? 0), 0);
  const checks = contracts.reduce((n, c) => n + c.checks.length, 0);
  const steps: { icon: ReactNode; title: string; detail: ReactNode }[] = [
    { icon: <Send />, title: "A result arrives", detail: "from a live run, a recorded demo or the submission API" },
    { icon: <FileCode2 />, title: `${contracts.length} contracts`, detail: "YAML, versioned and hashed, one per task type" },
    { icon: <ListChecks />, title: `${checks} checks`, detail: "run by Select itself; a model never reports its own result" },
    {
      icon: <ReceiptIcon />,
      title: "A receipt",
      detail: (
        <span className="tabular">
          <span className="text-success">{sum("verified")} verified</span> · <span className={sum("failed") ? "text-danger" : undefined}>{sum("failed")} failed</span> · {sum("blocked")} missing info
        </span>
      ),
    },
  ];
  return (
    <Card aria-label="How verification works">
      <ol className="grid divide-line-soft sm:grid-cols-2 sm:divide-x xl:grid-cols-4 max-xl:sm:[&>li:nth-child(n+3)]:border-t max-sm:divide-y">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 border-line-soft px-4 py-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted [&_svg]:size-4" aria-hidden>{s.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-fg">{s.title}</span>
              <span className="block text-xs text-muted">{s.detail}</span>
            </span>
            {i < steps.length - 1 && <ArrowRight className="absolute top-1/2 -right-2 z-[1] hidden size-4 -translate-y-1/2 rounded-full bg-surface text-faint xl:block" aria-hidden />}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ContractInspector({ contract }: { contract: ContractView }) {
  const [showSource, setShowSource] = useState(false);
  return (
    <div className="space-y-5 p-5">
      <p className="text-[13px] text-muted">{contract.description}</p>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-faint">Risk class</dt><dd className="mt-1"><Badge tone={RISK_TONE[contract.risk]}>{contract.risk}</Badge></dd></div>
        <div><dt className="text-faint">Highest level</dt><dd className="mt-1"><AutonomyLevel level={contract.cap} /></dd></div>
        <div><dt className="text-faint">Human approval</dt><dd className="mt-1 text-[13px] text-fg">{contract.approval.mode === "always" ? "Always" : "Depends on the agent's licence"}</dd></div>
        <div><dt className="text-faint">Automatic corrections</dt><dd className="mt-1 text-[13px] text-fg tabular">{contract.correction.max_attempts === 0 ? "None" : `Up to ${contract.correction.max_attempts}`}</dd></div>
        {contract.approval.external_action && <div className="col-span-2"><dt className="text-faint">Action after approval</dt><dd className="mt-1 text-[13px] text-fg">{contract.approval.external_action.replaceAll("_", " ")}</dd></div>}
      </dl>
      <section>
        <h3 className="mb-2 text-xs font-medium text-muted">Checks run by the system</h3>
        <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
          {contract.checks.map((ch) => (
            <li key={ch.id} className="px-3.5 py-2.5">
              <p className="text-[13px] text-fg">{ch.description || ch.id}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-faint">
                <span className="font-mono">{ch.id}</span><span aria-hidden>·</span><span className="font-mono">{ch.rule}</span>
                <span aria-hidden>·</span><span>{ch.blocking ? "blocking" : "non-blocking"}</span>
              </p>
            </li>
          ))}
        </ul>
        {contract.required.length > 0 && (
          <p className="mt-2 text-xs text-faint">Required fields: <span className="font-mono">{contract.required.join(", ")}</span>. Missing ones block the result instead of being guessed.</p>
        )}
      </section>
      <section>
        <button type="button" onClick={() => setShowSource(!showSource)} aria-expanded={showSource} className="flex items-center gap-1.5 rounded-md text-xs font-medium text-muted hover:text-fg">
          <FileCode2 className="size-3.5" aria-hidden />Source · contracts/{contract.id}.yaml
          <ChevronDown className={cx("size-3.5 transition-transform duration-150", showSource && "rotate-180")} aria-hidden />
        </button>
        {showSource && (
          <>
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-line-soft bg-canvas p-3 font-mono text-xs leading-relaxed text-muted">{contract.source}</pre>
            <p className="mt-1.5 font-mono text-2xs text-faint">sha256 {contract.sha256}</p>
          </>
        )}
      </section>
    </div>
  );
}

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
      <PageHeader title="Verification" description="Contracts say what a correct result is; the system checks every result and keeps a receipt" />
      <PageBody>
        {contracts.data && <Pipeline contracts={contracts.data} />}
        <Card className="overflow-hidden">
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
                  selectedKey={openContract?.id}
                  columns={[
                    { key: "title", header: "Contract", cell: (c) => <span className="flex items-baseline gap-2"><span className="text-fg">{c.title}</span><span className="font-mono text-xs text-faint">{c.id} v{c.version}</span></span> },
                    { key: "risk", header: "Risk", cell: (c) => <Badge tone={RISK_TONE[c.risk]}>{c.risk}</Badge> },
                    { key: "checks", header: "Checks", cell: (c) => <span className="text-muted tabular">{c.checks.length}</span>, align: "right" },
                    { key: "approval", header: "Human approval", cell: (c) => <span className="text-xs text-muted">{c.approval.mode === "always" ? "Always" : `By licence, up to ${c.cap}`}</span>, hideOnMobile: true },
                    {
                      key: "receipts",
                      header: "Receipts",
                      cell: (c) => (
                        <span className="text-xs text-muted tabular">
                          <span className="text-success">{c.receipts.verified ?? 0} ok</span> · <span className={(c.receipts.failed ?? 0) > 0 ? "text-danger" : undefined}>{c.receipts.failed ?? 0} failed</span> · {c.receipts.blocked ?? 0} blocked
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </TabPanel>
            <TabPanel value="receipts">
              <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
                <Segmented
                  label="Result"
                  value={status}
                  onChange={(v) => { setStatus(v); setOffset(0); }}
                  options={[{ value: "", label: "All" }, { value: "verified", label: "Verified" }, { value: "failed", label: "Failed" }, { value: "blocked", label: "Blocked" }]}
                />
                <label htmlFor="r-contract" className="sr-only">Contract</label>
                <Select id="r-contract" value={contract} onChange={(e) => { setContract(e.target.value); setOffset(0); }} className="h-7 w-40 text-xs">
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
                    selectedKey={openReceipt?.id}
                    empty={<EmptyState icon={<BadgeCheck />} title="No receipt" description="Receipts appear as soon as results are verified." />}
                    columns={[
                      { key: "task", header: "Task", cell: (r) => <span className="flex items-baseline gap-2"><span className="font-mono text-xs text-faint">{r.task_key}</span><span className="truncate text-fg">{r.task_title}</span>{r.is_demo && <DemoTag />}</span> },
                      { key: "status", header: "Result", cell: (r) => <ReceiptStatus status={r.status} /> },
                      { key: "checks", header: "Checks", cell: (r) => <span className="text-xs text-muted tabular">{r.body.checks.filter((c) => c.status === "passed").length}/{r.body.checks.length}</span>, hideOnMobile: true },
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
      <DetailPanel open={!!openContract} onOpenChange={(o) => !o && setOpenContract(null)} title={openContract?.title ?? ""} subtitle={openContract ? `${openContract.id} v${openContract.version}` : undefined}>
        {openContract && <ContractInspector contract={openContract} />}
      </DetailPanel>
      <DetailPanel
        open={!!openReceipt}
        onOpenChange={(o) => !o && setOpenReceipt(null)}
        title={openReceipt ? `Receipt · ${openReceipt.task_key}` : ""}
        subtitle={openReceipt?.task_title ?? undefined}
        actions={openReceipt && <Link href={`/c/${cid}/tasks/${openReceipt.task_id}`} className="mr-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-hover hover:text-accent-strong">Open task</Link>}
      >
        {openReceipt && <div className="p-5"><VerificationReceipt receipt={openReceipt} /></div>}
      </DetailPanel>
    </>
  );
}
