"use client";

import { ClipboardCheck } from "lucide-react";
import { useState } from "react";

import { ApprovalCard } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Button, Card, cx } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAction, useApprovals, useCompany, useCompanyId } from "@/lib/queries";

export default function ApprovalsPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const [view, setView] = useState<"pending" | "decided">("pending");
  const approvals = useApprovals(cid, view);
  const [busyId, setBusyId] = useState<string | null>(null);
  const decide = useAction(
    cid,
    (v: { id: string; decision: string; note: string }) => api(`/companies/${cid}/approvals/${v.id}/decide`, { method: "POST", body: { decision: v.decision, note: v.note } }),
    { success: "Decision recorded", onSuccess: () => setBusyId(null) },
  );
  const viewer = company.data?.role === "viewer";
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Exactly what each agent wants to do, the proof behind it, and why a human is asked."
        actions={
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Show">
            {(["pending", "decided"] as const).map((v) => (
              <Button key={v} size="sm" variant="ghost" aria-pressed={view === v} className={cx(view === v && "bg-raised text-fg")} onClick={() => setView(v)}>
                {v === "pending" ? "Waiting" : "History"}
              </Button>
            ))}
          </div>
        }
      />
      <PageBody>
        {approvals.isPending ? (
          <Card><LoadingRows /></Card>
        ) : approvals.isError ? (
          <Card><ErrorState error={approvals.error} retry={() => void approvals.refetch()} /></Card>
        ) : approvals.data.items.length === 0 ? (
          <Card>
            <EmptyState icon={<ClipboardCheck />} title={view === "pending" ? "Nothing waits for your approval" : "No decision yet"}
              description={view === "pending" ? "Results that pass verification but need a human (supervised agents, sampled reviews, risky contracts) appear here." : undefined} />
          </Card>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {viewer && view === "pending" && <p className="text-sm text-muted">You have read-only access: an admin or member must decide.</p>}
            {approvals.data.items.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                readOnly={viewer}
                busy={decide.isPending && busyId === a.id}
                onDecide={(decision, note) => {
                  if (viewer) return;
                  setBusyId(a.id);
                  decide.mutate({ id: a.id, decision, note });
                }}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
