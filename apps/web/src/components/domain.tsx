"use client";

/**
 * Domain components: AgentAvatar, AgentStatus, AutonomyLevel, TaskStatusBadge, VerificationReceipt,
 * ApprovalCard, CostMetric and ActivityTimeline. Pages compose these instead of re-styling.
 */
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, CheckCircle2, CircleSlash, Cog, Hash, Lock, User, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { formatDate, money, relative, taskTypeLabel } from "@/lib/format";
import { useCompanyId } from "@/lib/queries";
import type { Agent, Approval, AuditEvent, CheckResult, Level, Receipt, TaskStatus } from "@/lib/types";
import { Badge, Button, Textarea, cx } from "./ui/primitives";
import { Tooltip } from "./ui/overlay";

export function AgentAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const sizes = { sm: "size-6 text-2xs", md: "size-8 text-xs", lg: "size-11 text-sm" };
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-raised font-semibold text-muted", sizes[size])}>
      {initials || <Bot className="size-3.5" />}
    </span>
  );
}

/** Honest status: an agent is "not connected" unless a live run could actually start. */
export function AgentStatus({ agent }: { agent: Pick<Agent, "status" | "connected" | "is_demo_agent" | "provider"> }) {
  if (agent.status === "paused") return <Badge tone="warning" dot>Paused</Badge>;
  if (agent.status === "archived") return <Badge dot>Archived</Badge>;
  if (agent.is_demo_agent) return <Badge tone="sampled" dot>Demo replay</Badge>;
  if (agent.connected) return <Badge tone="success" dot>Ready</Badge>;
  return (
    <Tooltip content={agent.provider ? `No enabled ${agent.provider} connection yet. Add it in Connections.` : "No provider or model set. Results can still be submitted through the API."}>
      <span tabIndex={0}><Badge dot>Not connected</Badge></span>
    </Tooltip>
  );
}

const LEVEL_LABEL: Record<Level, string> = { supervised: "Supervised", sampled: "Sampled", autonomous: "Autonomous" };
const LEVEL_HELP: Record<Level, string> = {
  supervised: "Every result is approved by a human.",
  sampled: "A share of results is reviewed by a human, chosen at random.",
  autonomous: "Results that pass their contract finish without review. Revocable at any time.",
};

export function AutonomyLevel({ level, frozen, compact }: { level: Level; frozen?: boolean; compact?: boolean }) {
  return (
    <Tooltip content={frozen ? "Revoked by a human: frozen until someone clears it." : LEVEL_HELP[level]}>
      <span tabIndex={0} className="inline-flex">
        <Badge tone={level} dot={!compact}>
          {LEVEL_LABEL[level]}
          {frozen && <Lock className="size-3" aria-label="frozen" />}
        </Badge>
      </span>
    </Tooltip>
  );
}

export function LevelSteps({ level, cap }: { level: Level; cap: Level }) {
  const levels: Level[] = ["supervised", "sampled", "autonomous"];
  const capIndex = levels.indexOf(cap);
  return (
    <div className="flex items-center gap-1" aria-label={`Level ${level}, cap ${cap}`}>
      {levels.map((l, i) => (
        <span
          key={l}
          title={i > capIndex ? `${LEVEL_LABEL[l]}: above the risk cap` : LEVEL_LABEL[l]}
          className={cx(
            "h-1.5 w-6 rounded-full",
            i <= levels.indexOf(level) ? { supervised: "bg-supervised", sampled: "bg-sampled", autonomous: "bg-autonomous" }[level] : i > capIndex ? "bg-line/40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_2px,var(--color-line)_2px,var(--color-line)_4px)]" : "bg-raised",
          )}
        />
      ))}
    </div>
  );
}

const STATUS: Record<TaskStatus, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  backlog: { label: "Backlog", tone: "neutral" },
  todo: { label: "To do", tone: "neutral" },
  in_progress: { label: "In progress", tone: "accent" },
  awaiting_approval: { label: "Awaiting approval", tone: "supervised" },
  blocked: { label: "Blocked", tone: "danger" },
  done: { label: "Done", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const statusLabel = (s: TaskStatus) => STATUS[s].label;

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

export function ReceiptStatus({ status }: { status: Receipt["status"] }) {
  if (status === "verified") return <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Verified</Badge>;
  if (status === "failed") return <Badge tone="danger"><XCircle className="size-3" aria-hidden />Failed</Badge>;
  return <Badge tone="warning"><CircleSlash className="size-3" aria-hidden />Blocked</Badge>;
}

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(check.status !== "passed");
  const hasEvidence = Object.keys(check.evidence ?? {}).length > 0;
  return (
    <li className="py-2">
      <button type="button" onClick={() => setOpen(!open)} disabled={!hasEvidence} aria-expanded={hasEvidence ? open : undefined} className="flex w-full items-start gap-2.5 text-left disabled:cursor-default">
        {check.status === "passed" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="passed" />
        ) : check.status === "error" ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="error" />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="failed" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-mono text-xs text-fg">{check.id}</span>
            {!check.blocking && <span className="text-2xs text-faint">non-blocking</span>}
          </span>
          <span className="block text-xs text-muted">{check.message}</span>
          {check.description && <span className="block text-xs text-faint">{check.description}</span>}
        </span>
      </button>
      {open && hasEvidence && (
        <pre className="mt-2 ml-6.5 max-h-48 overflow-auto rounded-md border border-line bg-canvas p-2.5 font-mono text-2xs leading-relaxed text-muted">
          {JSON.stringify(check.evidence, null, 2)}
        </pre>
      )}
    </li>
  );
}

/** The proof attached to a result: contract, version, hash, every check run by the system. */
export function VerificationReceipt({ receipt }: { receipt: Receipt }) {
  const passed = receipt.body.checks.filter((c) => c.status === "passed").length;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ReceiptStatus status={receipt.status} />
          <span className="text-xs text-muted tabular">{passed}/{receipt.body.checks.length} checks passed</span>
        </div>
        <span className="font-mono text-2xs text-faint">
          {receipt.contract_id} v{receipt.contract_version} · {receipt.contract_sha256.slice(0, 10)}
        </span>
      </div>
      {receipt.body.missing.length > 0 && (
        <div className="border-b border-line px-3.5 py-2 text-xs text-warning">
          Missing, not guessed: <span className="font-mono">{receipt.body.missing.join(", ")}</span>
        </div>
      )}
      <ul className="divide-y divide-line/60 px-3.5">
        {receipt.body.checks.map((c) => <CheckRow key={c.id} check={c} />)}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3.5 py-2 font-mono text-2xs text-faint">
        <span>run {receipt.run_id.slice(0, 8)}</span>
        <span>output sha256 {receipt.body.deliverable_sha256.slice(0, 12)}</span>
        <span>{receipt.body.verifier}</span>
        <span>{formatDate(receipt.created_at)}</span>
      </div>
    </div>
  );
}

const REASON: Record<string, string> = {
  supervised: "Agent is supervised for this task type",
  sampled: "Picked for a random review",
  contract_always: "This contract always needs a human",
  risk_cap: "Risk class caps autonomy here",
};

/** One pending action, thumb-friendly on phones: what leaves Select, why, and the proof. */
export function ApprovalCard({ approval, onDecide, busy, readOnly }: {
  approval: Approval;
  onDecide: (decision: "approved" | "rejected" | "changes_requested", note: string) => void;
  busy: boolean;
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "changes_requested" | "rejected">("idle");
  const [note, setNote] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const cid = useCompanyId();
  return (
    <article className="rounded-lg border border-line bg-card" aria-label={`Approval for ${approval.task_key}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/c/${cid}/tasks/${approval.task_id}`} className="font-mono text-xs text-muted hover:text-fg">{approval.task_key}</Link>
            <span className="truncate text-sm font-medium">{approval.task_title}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {approval.agent_name} · {taskTypeLabel(approval.task_type ?? "")} · {REASON[approval.reason] ?? approval.reason}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {approval.is_demo && <Badge tone="sampled">Demo</Badge>}
          {approval.receipt && <ReceiptStatus status={approval.receipt.status} />}
        </div>
      </header>
      <div className="px-4 py-3">
        <p className="mb-1.5 text-2xs font-medium tracking-wide text-faint uppercase">
          {approval.action ? `Would be sent: ${approval.action.replaceAll("_", " ")}` : "Result to accept"}
        </p>
        <pre className="max-h-64 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">
          {approval.payload.preview.join("\n")}
        </pre>
        {approval.action && (
          <p className="mt-2 text-xs text-faint">
            No outbound connector is configured in this version: approving records the decision and marks the action ready to send.
          </p>
        )}
        {approval.receipt && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => setShowReceipt(!showReceipt)} aria-expanded={showReceipt}>
              {showReceipt ? "Hide" : "Show"} verification receipt
            </Button>
            {showReceipt && <div className="mt-2"><VerificationReceipt receipt={approval.receipt} /></div>}
          </div>
        )}
      </div>
      {approval.status === "pending" && readOnly ? (
        <footer className="border-t border-line px-4 py-2.5 text-xs text-muted">Waiting for a member or admin to decide.</footer>
      ) : approval.status === "pending" ? (
        <footer className="border-t border-line px-4 py-3">
          {mode !== "idle" && (
            <div className="mb-3">
              <label htmlFor={`note-${approval.id}`} className="mb-1.5 block text-xs text-muted">
                {mode === "rejected" ? "Why is it rejected?" : "What should change?"} The agent loses its autonomy on this task type.
              </label>
              <Textarea id={`note-${approval.id}`} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" autoFocus />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {mode === "idle" ? (
              <>
                <Button touch variant="ghost" onClick={() => setMode("rejected")} disabled={busy}>Reject</Button>
                <Button touch onClick={() => setMode("changes_requested")} disabled={busy}>Request changes</Button>
                <Button touch variant="primary" loading={busy} onClick={() => onDecide("approved", "")}>Approve</Button>
              </>
            ) : (
              <>
                <Button touch variant="ghost" onClick={() => { setMode("idle"); setNote(""); }} disabled={busy}>Back</Button>
                <Button touch variant={mode === "rejected" ? "danger" : "primary"} loading={busy} disabled={!note.trim()} onClick={() => onDecide(mode, note.trim())}>
                  {mode === "rejected" ? "Reject" : "Send back to the agent"}
                </Button>
              </>
            )}
          </div>
        </footer>
      ) : (
        <footer className="border-t border-line px-4 py-2.5 text-xs text-muted">
          {approval.status.replace("_", " ")} by {approval.decided_by} · {relative(approval.decided_at)}
          {approval.note && <span className="block text-faint">“{approval.note}”</span>}
        </footer>
      )}
    </article>
  );
}

export function CostMetric({ label, amount, currency, kind, hint }: { label: string; amount: string | null; currency?: string; kind?: "actual" | "estimated"; hint?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        {kind === "estimated" && (
          <Tooltip content="Token counts come from the provider; the amount is estimated from your price table.">
            <span tabIndex={0}><Badge>est.</Badge></span>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 text-xl font-semibold tabular">{money(amount, currency, 4)}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

const ACTOR_ICON = { user: User, agent: Bot, system: Cog, demo: Hash } as const;

function eventTone(kind: string): string {
  if (kind.includes("demot") || kind.includes("failed") || kind.includes("revok") || kind.includes("problem") || kind.includes("rejected")) return "text-danger";
  if (kind.includes("promot") || kind.includes("verified") || kind.includes("approved") || kind.includes("completed")) return "text-success";
  if (kind.includes("approval.requested") || kind.includes("blocked")) return "text-warning";
  return "text-faint";
}

export function ActivityTimeline({ events, dense }: { events: AuditEvent[]; dense?: boolean }) {
  return (
    <ol className="relative">
      {events.map((e) => {
        const Icon = ACTOR_ICON[e.actor_type] ?? Cog;
        const up = e.kind.includes("promot");
        const down = e.kind.includes("demot") || e.kind.includes("revok");
        return (
          <li key={e.id} className={cx("flex gap-3 px-4", dense ? "py-2" : "py-2.5")}>
            <span className={cx("mt-0.5 shrink-0", eventTone(e.kind))} aria-hidden>
              {up ? <ArrowUpRight className="size-4" /> : down ? <ArrowDownRight className="size-4" /> : <Icon className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{e.summary}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                <span>{e.actor_name}</span>
                <span className="font-mono">{e.kind}</span>
                <time dateTime={e.created_at} title={formatDate(e.created_at)}>{relative(e.created_at)}</time>
                {e.is_demo && <Badge tone="sampled">Demo</Badge>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
