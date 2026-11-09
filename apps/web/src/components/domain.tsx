"use client";

/**
 * Domain components. Pages compose these instead of re-styling: agent identity and status, autonomy level
 * (label + 1-2-3 meter, never colour alone), task status icons, verification receipts, approval cards,
 * cost figures and the activity timeline.
 */
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Briefcase,
  Calculator,
  ChartLine,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Code,
  Code2,
  Cog,
  Cpu,
  Crown,
  Handshake,
  Hash,
  Headset,
  Inbox,
  Lock,
  Megaphone,
  Microscope,
  Palette,
  PenLine,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  Workflow,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { createElement, useState, type ReactNode } from "react";

import { formatDate, money, relative, taskTypeLabel } from "@/lib/format";
import { useCachedAgentRole, useCompanyId } from "@/lib/queries";
import type { Agent, Approval, AuditEvent, CheckResult, ContractView, Level, Licence, Receipt, TaskStatus } from "@/lib/types";
import { Badge, Button, DemoTag, StatusDot, Textarea, cx, type Tone } from "./ui/primitives";
import { ConfirmDialog, Tooltip } from "./ui/overlay";

/* ───────────────────────────── Agents ───────────────────────────── */

// Quiet, desaturated tints: each agent gets a stable identity without turning the UI into confetti.
const TINTS = [
  "bg-[#2b323b] text-[#b9c6d6]",
  "bg-[#2c3530] text-[#b7cdbf]",
  "bg-[#38322a] text-[#d6c5a8]",
  "bg-[#33303a] text-[#c8c0d4]",
  "bg-[#2a3436] text-[#b2cdd2]",
  "bg-[#372d2d] text-[#d6b8b4]",
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * An icon for a role, from words in the role in English, French or German: a crown for the CEO,
 * a chip for the CTO, angle brackets for a developer… Unknown roles keep the initials.
 */
const ROLE_ICONS: [RegExp, LucideIcon][] = [
  [/\b(ceo|pdg|chief executive|geschaftsfuhr|founder|fondat|president|directeur general|managing director|boss)/, Crown],
  [/\b(cto|chief technology|tech lead|architect|technique|technical)/, Cpu],
  [/(develop|engineer|ingenieur|entwickl|coder|programm|software|frontend|backend|devops|\bdev\b|codex|claude ?code)/, Code],
  [/\b(cfo|financ|comptab|accountant|accounting|buchhalt|factur|invoice|billing|rechnung)/, Calculator],
  [/\b(cmo|marketing|communication|kommunikation|social|content|contenu|brand|marque|seo|publication|beitrag|posts?\b)/, Megaphone],
  [/(support|service client|customer|kunden|helpdesk|hotline|repond|answers?\b)/, Headset],
  [/(sales|vente|commercial|vertrieb|devis|quote|angebot|account exec|business dev)/, Handshake],
  [/(triage|courrier|mail|inbox|reception|accueil|empfang)/, Inbox],
  [/(design|graphi|ux|ui\b|illustrat)/, Palette],
  [/(legal|juridique|jurist|lawyer|avocat|recht|compliance|conformit)/, Scale],
  [/(\bhr\b|\brh\b|ressources humaines|human resources|recrut|recruit|personal)/, Users],
  [/(data|analyst|analyste|analytics|bi\b|reporting)/, ChartLine],
  [/(research|recherche|forsch|scientist)/, Microscope],
  [/(writer|redact|redakt|redig|copy|editor|editeur|traduct|translat)/, PenLine],
  [/(\bqa\b|quality|qualite|qualitat|test|review|audit)/, ShieldCheck],
  [/(ops|operation|operat|coordinat|planning|project manager|chef de projet)/, Workflow],
  [/(assistant|secretar|office|admin)/, Briefcase],
];

export function roleIcon(role: string | undefined): LucideIcon | null {
  if (!role) return null;
  const text = role.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ROLE_ICONS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** The role's icon as an element (the icon component comes from a static table). */
function RoleGlyph({ role, className }: { role: string; className: string }) {
  const icon = roleIcon(role);
  return icon ? createElement(icon, { className, strokeWidth: 2 }) : null;
}

export function AgentAvatar({ name, role, size = "md" }: { name: string; role?: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const cached = useCachedAgentRole(name);
  const known = role ?? cached;
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const sizes = { xs: "size-5 rounded-md text-[9px]", sm: "size-6 rounded-[7px] text-2xs", md: "size-8 rounded-lg text-xs", lg: "size-11 rounded-xl text-sm" };
  const icons = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" };
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center font-semibold ring-1 ring-white/[0.06] ring-inset", TINTS[hash(name) % TINTS.length], sizes[size])}>
      {known && roleIcon(known) ? <RoleGlyph role={known} className={icons[size]} /> : initials || <Bot className={icons[size]} />}
    </span>
  );
}

/* ───────────────────────────── Projects ───────────────────────────── */

const DOTS = ["bg-dot-1", "bg-dot-2", "bg-dot-3", "bg-dot-4", "bg-dot-5", "bg-dot-6", "bg-dot-7", "bg-dot-8"];

/** A project's colour: stable, from its id, so the same project looks the same everywhere. */
export function ProjectDot({ id, className, label }: { id: string; className?: string; label?: string }) {
  return (
    <span
      className={cx("inline-block size-2.5 shrink-0 rounded-full", DOTS[hash(id) % DOTS.length], className)}
      {...(label ? { role: "img", "aria-label": label, title: label } : { "aria-hidden": true })}
    />
  );
}

/** Honest status: an agent is "not connected" unless a live run could actually start. */
export function AgentStatus({ agent }: { agent: Pick<Agent, "status" | "connected" | "is_demo_agent" | "provider"> }) {
  const item = (tone: Tone, label: string, pulse = false) => (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <StatusDot tone={tone} pulse={pulse} />
      {label}
    </span>
  );
  if (agent.status === "paused") return item("warning", "Paused");
  if (agent.status === "archived") return item("neutral", "Archived");
  if (agent.is_demo_agent) return item("sampled", "Demo replay");
  if (agent.connected) return item("success", "Ready");
  return (
    <Tooltip content={agent.provider ? `No enabled ${agent.provider} connection yet. Add it in Connections.` : "No provider or model set. Results can still be submitted through the API."}>
      <span tabIndex={0} className="inline-flex rounded-sm">{item("neutral", "Not connected")}</span>
    </Tooltip>
  );
}

const PROVIDER_LABEL: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini", ollama: "Ollama" };
export const providerLabel = (p: string | null | undefined) => (p ? PROVIDER_LABEL[p] ?? p : "No provider");

/* ──────────────────────────── Autonomy ──────────────────────────── */

export const LEVELS: Level[] = ["supervised", "sampled", "autonomous"];
export const LEVEL_LABEL: Record<Level, string> = { supervised: "Supervised", sampled: "Sampled", autonomous: "Autonomous" };
export const LEVEL_HELP: Record<Level, string> = {
  supervised: "Every result is approved by a human.",
  sampled: "A share of results is reviewed by a human, picked at random.",
  autonomous: "Results that pass their contract finish without review. Revocable at any time.",
};
const LEVEL_BG: Record<Level, string> = { supervised: "bg-supervised", sampled: "bg-sampled", autonomous: "bg-autonomous" };

/** The level as a count (1, 2 or 3 filled squares), so it reads without colour. */
export function LevelMeter({ level, className }: { level: Level; className?: string }) {
  const filled = LEVELS.indexOf(level) + 1;
  return (
    <span className={cx("inline-flex items-center gap-[2px]", className)} aria-hidden>
      {LEVELS.map((l, i) => (
        <span key={l} className={cx("size-[5px] rounded-[1.5px]", i < filled ? LEVEL_BG[level] : "bg-line-strong")} />
      ))}
    </span>
  );
}

export function AutonomyLevel({ level, frozen, compact }: { level: Level; frozen?: boolean; compact?: boolean }) {
  return (
    <Tooltip content={frozen ? "Revoked by a human: frozen until someone clears it." : LEVEL_HELP[level]}>
      <span tabIndex={0} className="inline-flex rounded-sm" aria-label={`${LEVEL_LABEL[level]}${frozen ? ", frozen" : ""}`}>
        <span className={cx("inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", {
          supervised: "bg-supervised/10 text-supervised ring-supervised/20",
          sampled: "bg-sampled/10 text-sampled ring-sampled/20",
          autonomous: "bg-autonomous/10 text-autonomous ring-autonomous/20",
        }[level])}>
          <LevelMeter level={level} />
          {!compact && LEVEL_LABEL[level]}
          {compact && <span className="sr-only">{LEVEL_LABEL[level]}</span>}
          {frozen && <Lock className="size-3" aria-hidden />}
        </span>
      </span>
    </Tooltip>
  );
}

/** Three-step track: reached steps in the level colour, steps above the risk cap hatched. */
export function LevelSteps({ level, cap }: { level: Level; cap: Level }) {
  const capIndex = LEVELS.indexOf(cap);
  const reached = LEVELS.indexOf(level);
  return (
    <div className="flex items-center gap-[3px]" role="img" aria-label={`Level ${LEVEL_LABEL[level]}, capped at ${LEVEL_LABEL[cap]}`}>
      {LEVELS.map((l, i) => (
        <span
          key={l}
          title={i > capIndex ? `${LEVEL_LABEL[l]}: above the risk cap` : LEVEL_LABEL[l]}
          className={cx(
            "h-1.5 w-5 rounded-full",
            i <= reached
              ? LEVEL_BG[level]
              : i > capIndex
                ? "[background-image:repeating-linear-gradient(-45deg,var(--color-line-strong)_0_2px,transparent_2px_4px)]"
                : "bg-line-strong",
          )}
        />
      ))}
    </div>
  );
}

const STATION: Record<Level, string> = { supervised: "bg-supervised", sampled: "bg-sampled", autonomous: "bg-autonomous" };

/**
 * The licence ladder: three stations, the current one marked, the streak filling the way to the next one.
 * Stations above the risk cap are hatched and locked, so "why it cannot go further" is visible.
 */
export function LicenceLadder({ licence }: { licence: Licence }) {
  const at = LEVELS.indexOf(licence.level);
  const cap = LEVELS.indexOf(licence.cap);
  const fill = licence.next_threshold ? Math.min(1, licence.streak / licence.next_threshold) : 0;
  const label = licence.frozen
    ? `${LEVEL_LABEL[licence.level]}, frozen by a human`
    : licence.always_reviewed
      ? `${LEVEL_LABEL[licence.level]}: a person reviews every result of this contract`
    : licence.promotion_blocked
      ? `${LEVEL_LABEL[licence.level]}, ${licence.level === "autonomous" ? "top level" : `capped at ${LEVEL_LABEL[licence.cap]} by risk`}`
      : licence.next_threshold
        ? `${LEVEL_LABEL[licence.level]}, ${licence.streak} of ${licence.next_threshold} verified successes in a row towards ${LEVEL_LABEL[LEVELS[at + 1]!]}`
        : LEVEL_LABEL[licence.level];
  return (
    <div className="flex min-w-[200px] items-center" role="img" aria-label={label}>
      {LEVELS.map((level, i) => {
        const reached = i <= at;
        const capped = i > cap;
        return (
          <div key={level} className="flex flex-1 items-center last:flex-none">
            <span
              title={capped ? `${LEVEL_LABEL[level]}: ${licence.always_reviewed ? "every result of this contract is reviewed" : "above the risk cap for this contract"}` : LEVEL_LABEL[level]}
              className={cx(
                "relative flex size-3.5 shrink-0 items-center justify-center rounded-full",
                reached ? STATION[licence.level] : capped ? "border border-dashed border-line-strong" : "border border-line-strong bg-surface",
                i === at && "ring-4 ring-white/[0.06]",
              )}
            >
              {capped && <Lock className="size-2 text-ghost" aria-hidden />}
              {i === at && licence.frozen && <Lock className="size-2 text-canvas" aria-hidden />}
            </span>
            {i < LEVELS.length - 1 && (
              <span className="relative mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-line-soft">
                {i + 1 > cap ? (
                  <span className="absolute inset-0 [background-image:repeating-linear-gradient(-45deg,var(--color-line-strong)_0_2px,transparent_2px_5px)]" />
                ) : i < at ? (
                  <span className={cx("absolute inset-0", STATION[licence.level])} />
                ) : i === at && !licence.frozen ? (
                  <span className={cx("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out", STATION[licence.level])} style={{ width: `${fill * 100}%` }} />
                ) : null}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LicenceNextStep({ licence }: { licence: Licence }) {
  if (licence.frozen) return <Badge tone="danger"><Lock className="size-3" aria-hidden />Frozen by a human</Badge>;
  if (licence.always_reviewed) return <span className="text-xs text-faint">Always reviewed by a person</span>;
  if (licence.promotion_blocked) {
    return <span className="text-xs text-faint">{licence.level === "autonomous" ? "Top level reached" : `Capped by ${licence.risk ?? "risk"} risk`}</span>;
  }
  if (!licence.next_threshold) return null;
  const left = Math.max(0, licence.next_threshold - licence.streak);
  return (
    <span className="text-xs text-muted">
      <span className="text-fg tabular">{licence.streak}/{licence.next_threshold}</span> · {left} more for {LEVEL_LABEL[LEVELS[LEVELS.indexOf(licence.level) + 1]!].toLowerCase()}
    </span>
  );
}

/* ───────────────────────────── Tasks ────────────────────────────── */

const STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  backlog: { label: "Backlog", tone: "neutral" },
  todo: { label: "To do", tone: "neutral" },
  in_progress: { label: "In progress", tone: "accent" },
  awaiting_approval: { label: "Awaiting approval", tone: "supervised" },
  blocked: { label: "Blocked", tone: "danger" },
  done: { label: "Done", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const statusLabel = (s: TaskStatus) => STATUS[s].label;
export const STATUS_ORDER: TaskStatus[] = ["awaiting_approval", "blocked", "in_progress", "todo", "backlog", "done", "cancelled"];

/** Linear-style status glyphs, drawn on one 14 px grid. */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const common = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": true, className: cx("shrink-0", className) } as const;
  switch (status) {
    case "backlog":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" stroke="var(--color-faint)" strokeWidth="1.5" strokeDasharray="2.2 2.1" /></svg>;
    case "todo":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" stroke="var(--color-muted)" strokeWidth="1.5" /></svg>;
    case "in_progress":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" stroke="var(--color-accent)" strokeWidth="1.5" /><path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="var(--color-accent)" /></svg>;
    case "awaiting_approval":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" stroke="var(--color-supervised)" strokeWidth="1.5" /><path d="M7 3.5a3.5 3.5 0 1 1-3.5 3.5H7z" fill="var(--color-supervised)" /></svg>;
    case "blocked":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" stroke="var(--color-danger)" strokeWidth="1.5" /><path d="M4.75 7h4.5" stroke="var(--color-danger)" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "done":
      return <svg {...common}><circle cx="7" cy="7" r="6.25" fill="var(--color-success)" /><path d="m4.4 7.2 1.8 1.8 3.5-3.6" stroke="var(--color-canvas)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "cancelled":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" stroke="var(--color-faint)" strokeWidth="1.5" /><path d="m4.9 9.1 4.2-4.2" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
}

export function TaskStatusBadge({ status, plain }: { status: TaskStatus; plain?: boolean }) {
  if (plain) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <StatusIcon status={status} />
        {STATUS[status].label}
      </span>
    );
  }
  return (
    <Badge tone={STATUS[status].tone}>
      <StatusIcon status={status} className="-ml-0.5 size-3" />
      {STATUS[status].label}
    </Badge>
  );
}

const PRIORITY_BARS = { low: 1, medium: 2, high: 3, urgent: 4 } as const;

/** Priority as bars; urgent is the only one with colour. */
export function PriorityIcon({ priority }: { priority: keyof typeof PRIORITY_BARS }) {
  const n = PRIORITY_BARS[priority];
  if (priority === "urgent") {
    return (
      <span role="img" aria-label="Urgent priority" className="inline-flex size-3.5 items-center justify-center rounded-[4px] bg-danger/85 text-[10px] leading-none font-bold text-canvas">!</span>
    );
  }
  return (
    <span role="img" aria-label={`${priority} priority`} className="inline-flex h-3.5 items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx("w-[3px] rounded-[1px]", i === 1 ? "h-[6px]" : i === 2 ? "h-[9px]" : "h-[12px]", i <= n ? "bg-muted" : "bg-line-strong")} />
      ))}
    </span>
  );
}

/* ────────────────────────── Verification ───────────────────────── */

export function ReceiptStatus({ status }: { status: Receipt["status"] }) {
  if (status === "verified") return <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Verified</Badge>;
  if (status === "failed") return <Badge tone="danger"><XCircle className="size-3" aria-hidden />Failed</Badge>;
  return <Badge tone="warning"><CircleSlash className="size-3" aria-hidden />Blocked</Badge>;
}

function CheckGlyph({ status }: { status: CheckResult["status"] }) {
  if (status === "passed") {
    return (
      <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-success/14 text-success" role="img" aria-label="passed">
        <Check className="size-3" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-warning/14 text-warning" role="img" aria-label="error">
        <AlertTriangle className="size-3" aria-hidden />
      </span>
    );
  }
  return (
    <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-danger/14 text-danger" role="img" aria-label="failed">
      <XCircle className="size-3" aria-hidden />
    </span>
  );
}

function CheckRow({ check, technical }: { check: CheckResult; technical: boolean }) {
  // The evidence of a failure is shown straight away; passed checks keep it one click away.
  const [open, setOpen] = useState(check.status !== "passed");
  const hasEvidence = Object.keys(check.evidence ?? {}).length > 0;
  return (
    <li className="flex gap-3 py-2.5">
      <CheckGlyph status={check.status} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg">{check.description || check.id}</p>
        <p className={cx("mt-0.5 text-xs", check.status === "passed" ? "text-muted" : check.status === "failed" ? "text-danger" : "text-warning")}>{check.message}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-faint">
          <span className="font-mono">{check.id}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{check.rule}</span>
          {!check.blocking && <><span aria-hidden>·</span><span>non-blocking</span></>}
          {hasEvidence && !technical && (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-0.5 rounded-sm text-faint hover:text-fg">
              evidence <ChevronDown className={cx("size-3 transition-transform duration-150", open && "rotate-180")} aria-hidden />
            </button>
          )}
        </p>
        {hasEvidence && (open || technical) && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-line-soft bg-canvas p-2.5 font-mono text-2xs leading-relaxed text-muted">
            {JSON.stringify(check.evidence, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}

/** The proof attached to a result: contract, version, hash and every check the system ran. */
export function VerificationReceipt({ receipt, defaultTechnical = false }: { receipt: Receipt; defaultTechnical?: boolean }) {
  const [technical, setTechnical] = useState(defaultTechnical);
  const checks = receipt.body.checks;
  const passed = checks.filter((c) => c.status === "passed").length;
  const failing = checks.filter((c) => c.status !== "passed");
  const ordered = [...failing, ...checks.filter((c) => c.status === "passed")];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <ReceiptStatus status={receipt.status} />
          <span className="text-xs text-muted tabular">{passed}/{checks.length} checks passed</span>
          {receipt.is_demo && <DemoTag />}
        </div>
        <button
          type="button"
          onClick={() => setTechnical(!technical)}
          aria-pressed={technical}
          className={cx("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs transition-colors", technical ? "bg-selected text-fg" : "text-faint hover:bg-hover hover:text-fg")}
        >
          <Code2 className="size-3.5" aria-hidden /> Technical view
        </button>
      </div>
      {receipt.body.missing.length > 0 && (
        <div className="flex items-start gap-2 border-b border-line-soft bg-warning/6 px-4 py-2 text-xs text-warning">
          <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Missing, not guessed: <span className="font-mono">{receipt.body.missing.join(", ")}</span></span>
        </div>
      )}
      {receipt.body.capability_boundary && (
        <div className="border-t border-line-soft bg-surface-2 px-4 py-3 text-xs" role="note">
          <p className="font-semibold text-fg">Verified for this proposal scope only</p>
          <p className="mt-1 break-all font-mono text-muted">{receipt.body.capability_boundary.scope}</p>
          <p className="mt-1 text-faint">
            Human review required. This receipt grants no permission to send mail, run code,
            modify production or use another repository.
          </p>
        </div>
      )}
      <ul className="divide-y divide-line-soft px-4">
        {ordered.map((c) => <CheckRow key={c.id} check={c} technical={technical} />)}
      </ul>
      {technical ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-line-soft bg-canvas/40 px-4 py-3 font-mono text-2xs text-faint">
          <dt>contract</dt><dd className="truncate text-muted">{receipt.contract_id} v{receipt.contract_version}</dd>
          <dt>contract sha256</dt><dd className="truncate text-muted">{receipt.contract_sha256}</dd>
          {receipt.body.capability_boundary && (
            <>
              <dt>allowed scope</dt><dd className="break-all text-muted">{receipt.body.capability_boundary.scope}</dd>
              <dt>grant id</dt><dd className="truncate text-muted">{receipt.body.capability_boundary.grant_id}</dd>
              <dt>unlocked rights</dt><dd className="text-muted">none (review only)</dd>
            </>
          )}
          <dt>output sha256</dt><dd className="truncate text-muted">{receipt.body.deliverable_sha256}</dd>
          <dt>run</dt><dd className="truncate text-muted">{receipt.run_id}</dd>
          <dt>receipt</dt><dd className="truncate text-muted">{receipt.id}</dd>
          <dt>verifier</dt><dd className="truncate text-muted">{receipt.body.verifier}</dd>
          <dt>verified at</dt><dd className="truncate text-muted">{receipt.body.verified_at}</dd>
        </dl>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2 font-mono text-2xs text-faint">
          <span>{receipt.contract_id} v{receipt.contract_version} · {receipt.contract_sha256.slice(0, 10)}</span>
          <span>output {receipt.body.deliverable_sha256.slice(0, 12)}</span>
          <span>{formatDate(receipt.created_at)}</span>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Approvals ─────────────────────────── */

const REASON: Record<string, string> = {
  supervised: "The agent is supervised for this task type, so every result is approved by a human.",
  sampled: "The agent is sampled for this task type and this result was picked for a random review.",
  contract_always: "This contract always needs a human, whatever the agent's record.",
  risk_cap: "The contract's risk class caps autonomy here.",
  new_recipient: "The recipient never wrote to the company. Writing to a new address is a human decision, whatever the agent's record.",
};
export const REASON_SHORT: Record<string, string> = {
  supervised: "Supervised",
  sampled: "Random review",
  contract_always: "Always reviewed",
  risk_cap: "Risk cap",
  new_recipient: "New recipient",
};

/** What approving actually does, said plainly: what leaves Select and what never does. */
export function afterApproval(action: string | null, typeLabel: string, outgoing: string | null | undefined, demo: boolean): string {
  if (!action) return `${typeLabel} accepted and the task closes.`;
  if (demo) return "Demo: recorded as approved; nothing leaves Select.";
  if (action === "send_email" || action === "send_quote_email") {
    return outgoing ? `Sent once by e-mail from ${outgoing}.` : "Kept ready to send: no outgoing mailbox is connected yet.";
  }
  if (action === "publish_post") return "Marked ready to publish. Select does not post to social networks: copy it from the task.";
  if (action === "send_invoice_email") return "Marked ready. Select does not send invoices: this is a draft, not an e-invoice.";
  if (action === "none_payments_are_manual") return "Nothing is paid by Select: you make the payment in your bank.";
  return `Marked ready to ${action.replaceAll("_", " ")}.`;
}

const RISK_TONE: Record<string, Tone> = { low: "neutral", medium: "neutral", high: "warning", legal: "danger" };

/** The contract's external action, as the approval card says it: "Iris asks to send a quote by e-mail". */
const ACTION_TEXT: Record<string, string> = {
  send_email: "send an e-mail",
  send_quote_email: "send a quote by e-mail",
  send_invoice_email: "mark an invoice draft ready",
  publish_post: "mark a post ready to publish",
  none_payments_are_manual: "prepare a payment you make yourself",
};

/**
 * One pending decision, readable in five seconds: who asks, what would happen, why a human is asked,
 * which checks ran, the exact content, and what approving or rejecting changes.
 */
export function ApprovalCard({ approval, onDecide, busy, readOnly, risk, agentRole, outgoing }: {
  approval: Approval;
  onDecide: (decision: "approved" | "rejected" | "changes_requested", note: string) => void;
  busy: boolean;
  readOnly?: boolean;
  risk?: ContractView["risk"] | null;
  agentRole?: string | null;
  /** The address approved e-mails leave from, or null when no mailbox can send. */
  outgoing?: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "changes_requested" | "rejected">("idle");
  const [note, setNote] = useState("");
  const [showChecks, setShowChecks] = useState(false);
  const cid = useCompanyId();
  const checks = approval.receipt?.body.checks ?? [];
  const passed = checks.filter((c) => c.status === "passed").length;
  const highRisk = risk === "high" || risk === "legal";
  const agent = approval.agent_name ?? "The agent";
  const type = taskTypeLabel(approval.task_type ?? "");
  const action = approval.action ? (ACTION_TEXT[approval.action] ?? approval.action.replaceAll("_", " ")) : null;

  const approveButton = (
    <Button touch variant="primary" loading={busy} onClick={highRisk ? undefined : () => onDecide("approved", "")} icon={<Check className="size-3.5" aria-hidden />}>
      Approve
    </Button>
  );

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-sheen)]" aria-label={`Approval for ${approval.task_key}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar name={agent} size="md" />
          <div className="min-w-0">
            <p className="text-[13px] text-muted">
              <span className="font-medium text-fg">{agent}</span>
              {agentRole && <span> · {agentRole}</span>}
              <span> {action ? `asks to ${action}` : "asks you to accept its result"}</span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
              <Link href={`/c/${cid}/tasks/${approval.task_id}`} className="font-mono text-xs text-faint hover:text-fg">{approval.task_key}</Link>
              <span className="truncate text-sm font-semibold text-fg">{approval.task_title}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {approval.is_demo && <DemoTag />}
          {(risk === "high" || risk === "legal") && <Badge tone={RISK_TONE[risk] ?? "neutral"}>{risk === "legal" ? "Legal risk" : "High risk"}</Badge>}
          <Badge tone="supervised">{REASON_SHORT[approval.reason] ?? approval.reason}</Badge>
        </div>
      </header>

      <dl className="grid gap-px border-y border-line-soft bg-line-soft sm:grid-cols-3">
        <div className="bg-surface px-4 py-2.5">
          <dt className="text-2xs font-medium tracking-wide text-faint uppercase">Why you</dt>
          <dd className="mt-0.5 text-xs text-muted">{REASON[approval.reason] ?? approval.reason}</dd>
        </div>
        <div className="bg-surface px-4 py-2.5">
          <dt className="text-2xs font-medium tracking-wide text-faint uppercase">Checks</dt>
          <dd className="mt-0.5 text-xs">
            {approval.receipt ? (
              <button type="button" onClick={() => setShowChecks(!showChecks)} aria-expanded={showChecks} className="inline-flex items-center gap-1.5 rounded-sm text-muted hover:text-fg">
                <span className={cx("tabular", passed === checks.length ? "text-success" : "text-danger")}>{passed}/{checks.length} passed</span>
                <span className="text-faint">· {approval.receipt.contract_id} v{approval.receipt.contract_version}</span>
                <ChevronDown className={cx("size-3 transition-transform duration-150", showChecks && "rotate-180")} aria-hidden />
              </button>
            ) : (
              <span className="text-faint">No receipt attached</span>
            )}
          </dd>
        </div>
        <div className="bg-surface px-4 py-2.5">
          <dt className="text-2xs font-medium tracking-wide text-faint uppercase">After approval</dt>
          <dd className="mt-0.5 text-xs text-muted">
            {afterApproval(approval.action, type, outgoing, approval.is_demo)}
          </dd>
        </div>
      </dl>

      {showChecks && approval.receipt && (
        <div className="border-b border-line-soft px-4 py-3">
          <VerificationReceipt receipt={approval.receipt} />
        </div>
      )}

      <div className="px-4 py-3">
        <p className="mb-1.5 text-2xs font-medium tracking-wide text-faint uppercase">
          {approval.task_type === "code_change" ? "Proposed diff — not applied or tested" : approval.payload.email ? "Exactly the e-mail that would be sent" : action ? "Exactly what would leave Select" : "Result to accept"}
        </p>
        {approval.task_type === "code_change" && (
          <p role="note" className="mb-2.5 rounded-lg border border-warning/25 bg-warning/6 px-3 py-2 text-xs leading-relaxed text-muted">
            Review-only proposal: Select has not applied this patch, run the suggested tests, or pushed code. Approval only records your decision.
          </p>
        )}
        <pre className="max-h-[28rem] overflow-auto rounded-lg border border-line-soft bg-canvas px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">
          {approval.payload.preview.join("\n")}
        </pre>
      </div>

      {approval.status === "pending" && readOnly ? (
        <footer className="border-t border-line-soft px-4 py-2.5 text-xs text-muted">Waiting for a member or admin to decide.</footer>
      ) : approval.status === "pending" ? (
        <footer className="border-t border-line-soft bg-canvas/30 px-4 py-3">
          {mode !== "idle" && (
            <div className="mb-3">
              <label htmlFor={`note-${approval.id}`} className="mb-1.5 block text-xs text-muted">
                {mode === "rejected" ? "Why is it rejected?" : "What should change?"} {agent} goes back to supervised on {type}.
              </label>
              <Textarea id={`note-${approval.id}`} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" autoFocus />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {mode === "idle" ? (
              <>
                <p className="mr-auto hidden text-xs text-faint sm:block">Approving counts as a verified success for {agent} on {type}.</p>
                <Button touch variant="ghost" icon={<X className="size-3.5" aria-hidden />} onClick={() => setMode("rejected")} disabled={busy}>Reject</Button>
                <Button touch icon={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => setMode("changes_requested")} disabled={busy}>Request changes</Button>
                {highRisk ? (
                  <ConfirmDialog
                    trigger={approveButton}
                    title={`Approve ${approval.task_key}?`}
                    description={risk === "legal" ? "This is a legal-risk action. It always stays under human control, whatever the agent's record." : "This contract is classed as high risk."}
                    confirmLabel="Approve"
                    danger={false}
                    requireText={approval.task_key ?? undefined}
                    onConfirm={() => onDecide("approved", "")}
                  >
                    <p className="text-[13px] text-muted">Check the content and the receipt once more. The decision is recorded with your name.</p>
                  </ConfirmDialog>
                ) : (
                  approveButton
                )}
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
        <footer className="border-t border-line-soft px-4 py-2.5 text-xs text-muted">
          <span className="capitalize">{approval.status.replace("_", " ")}</span> by {approval.decided_by} · {relative(approval.decided_at)}
          {approval.note && <span className="block text-faint">“{approval.note}”</span>}
        </footer>
      )}
    </article>
  );
}

/* ───────────────────────────── Costs ────────────────────────────── */

export function CostMetric({ label, amount, currency, kind, hint }: { label: string; amount: string | null; currency?: string; kind?: "actual" | "estimated"; hint?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        {kind === "estimated" && (
          <Tooltip content="Token counts come from the provider; the amount is estimated from your price table.">
            <span tabIndex={0} className="rounded-sm"><Badge>est.</Badge></span>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 text-[22px] leading-7 font-bold tracking-[-0.02em] tabular">{money(amount, currency, 4)}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

/* ──────────────────────────── Activity ──────────────────────────── */

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
            <span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-2", eventTone(e.kind))} aria-hidden>
              {up ? <ArrowUpRight className="size-3.5" /> : down ? <ArrowDownRight className="size-3.5" /> : <Icon className="size-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg">{e.summary}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                <span>{e.actor_name}</span>
                <span className="font-mono text-2xs">{e.kind}</span>
                <time dateTime={e.created_at} title={formatDate(e.created_at)}>{relative(e.created_at)}</time>
                {e.is_demo && <DemoTag />}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
