"use client";

import { ClipboardCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AgentAvatar, ApprovalCard } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Badge, Card, DemoTag, Segmented, cx } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { relative, taskTypeLabel } from "@/lib/format";
import { useIsDesktop } from "@/lib/hooks";
import { useAction, useAgents, useApprovals, useCompany, useCompanyId, useContracts } from "@/lib/queries";
import type { Approval, ContractView } from "@/lib/types";

const REASON_SHORT: Record<string, string> = { supervised: "Supervised", sampled: "Random review", contract_always: "Always reviewed", risk_cap: "Risk cap" };

function QueueItem({ approval, selected, onSelect, risk }: { approval: Approval; selected: boolean; onSelect: () => void; risk?: ContractView["risk"] }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-[120ms]",
        selected ? "bg-selected shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-hover",
      )}
    >
      <AgentAvatar name={approval.agent_name ?? "?"} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-fg">{approval.task_title}</span>
          <span className="ml-auto shrink-0 text-xs text-faint">{relative(approval.created_at)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="font-mono text-faint">{approval.task_key}</span>
          <span className="truncate">{approval.agent_name} · {taskTypeLabel(approval.task_type ?? "")}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={approval.status === "pending" ? "supervised" : approval.status === "approved" ? "success" : "danger"}>
            {approval.status === "pending" ? REASON_SHORT[approval.reason] ?? approval.reason : approval.status.replace("_", " ")}
          </Badge>
          {(risk === "high" || risk === "legal") && <Badge tone={risk === "legal" ? "danger" : "warning"}>{risk === "legal" ? "Legal risk" : "High risk"}</Badge>}
          {approval.is_demo && <DemoTag />}
        </span>
      </span>
    </button>
  );
}

export default function ApprovalsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [view, setView] = useState<"pending" | "decided">("pending");
  const approvals = useApprovals(cid, view);
  const contracts = useContracts(cid);
  const agents = useAgents(cid);
  const desktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const decide = useAction(
    cid,
    (v: { id: string; decision: string; note: string }) => api(`/companies/${cid}/approvals/${v.id}/decide`, { method: "POST", body: { decision: v.decision, note: v.note } }),
    { success: "Decision recorded", onSuccess: () => setBusyId(null) },
  );
  const viewer = company.data?.role === "viewer";
  const items = useMemo(() => approvals.data?.items ?? [], [approvals.data]);
  const risk = useMemo(() => new Map((contracts.data ?? []).map((c) => [c.id, c.risk])), [contracts.data]);
  const roles = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a.role])), [agents.data]);

  // Keep a selection on desktop: the first item, or the next one after a decision.
  const selected = items.find((a) => a.id === selectedId) ?? (desktop ? items[0] : undefined);
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role='dialog']")) return;
      const index = items.findIndex((a) => a.id === selected?.id);
      if ((e.key === "j" || e.key === "ArrowDown") && index < items.length - 1) { e.preventDefault(); setSelectedId(items[index + 1]!.id); }
      if ((e.key === "k" || e.key === "ArrowUp") && index > 0) { e.preventDefault(); setSelectedId(items[index - 1]!.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, items, selected?.id]);

  const card = (a: Approval) => (
    <ApprovalCard
      key={a.id}
      approval={a}
      readOnly={viewer}
      risk={risk.get(a.task_type ?? "")}
      agentRole={a.agent_id ? roles.get(a.agent_id) : null}
      busy={decide.isPending && busyId === a.id}
      onDecide={(decision, note) => {
        if (viewer) return;
        setBusyId(a.id);
        const next = items[items.findIndex((x) => x.id === a.id) + 1];
        decide.mutate({ id: a.id, decision, note }, { onSuccess: () => setSelectedId(next?.id ?? null) });
      }}
    />
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        description="What each agent wants to do, the proof behind it, and why you are asked"
        actions={
          <Segmented
            label="Show"
            value={view}
            onChange={(v) => { setView(v); setSelectedId(null); }}
            options={[{ value: "pending", label: <>Waiting{view === "pending" && items.length ? <span className="tabular text-faint">{items.length}</span> : null}</> }, { value: "decided", label: "History" }]}
          />
        }
      />
      <PageBody>
        {approvals.isPending ? (
          <Card><LoadingRows /></Card>
        ) : approvals.isError ? (
          <Card><ErrorState error={approvals.error} retry={() => void approvals.refetch()} /></Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardCheck />}
              title={view === "pending" ? "Nothing waits for your approval" : "No decision yet"}
              description={view === "pending" ? "Results that pass verification but still need a human (supervised agents, random reviews, risky contracts) appear here." : undefined}
            />
          </Card>
        ) : desktop ? (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <Card className="overflow-hidden lg:sticky lg:top-0" aria-label="Approval queue">
              <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5 text-xs text-muted">
                <span>{items.length} {view === "pending" ? "waiting" : "decided"}</span>
                <span className="hidden text-faint lg:inline">J / K to move</span>
              </div>
              <ul className="max-h-[calc(100dvh-180px)] divide-y divide-line-soft overflow-y-auto">
                {items.map((a) => (
                  <li key={a.id}>
                    <QueueItem approval={a} selected={a.id === selected?.id} onSelect={() => setSelectedId(a.id)} risk={risk.get(a.task_type ?? "")} />
                  </li>
                ))}
              </ul>
            </Card>
            <div className="min-w-0 space-y-3">
              {viewer && view === "pending" && <p className="text-[13px] text-muted">You have read-only access: an admin or member must decide.</p>}
              {selected && card(selected)}
            </div>
          </div>
        ) : (
          <>
            {viewer && view === "pending" && <p className="text-[13px] text-muted">You have read-only access: an admin or member must decide.</p>}
            <Card className="overflow-hidden" aria-label="Approval queue">
              <ul className="divide-y divide-line-soft">
                {items.map((a) => (
                  <li key={a.id}>
                    <QueueItem approval={a} selected={false} onSelect={() => setSelectedId(a.id)} risk={risk.get(a.task_type ?? "")} />
                  </li>
                ))}
              </ul>
            </Card>
            <DetailPanel
              open={!!selected}
              onOpenChange={(open) => { if (!open) setSelectedId(null); }}
              title={selected?.task_title ?? ""}
              subtitle={selected ? `${selected.task_key} · ${selected.agent_name}` : undefined}
            >
              <div className="p-3">{selected && card(selected)}</div>
            </DetailPanel>
          </>
        )}
      </PageBody>
    </>
  );
}
