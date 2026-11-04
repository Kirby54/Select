"use client";

import { Building2, Check, ChevronsUpDown, OctagonX, PanelLeftClose, PanelLeftOpen, Plus, SquarePen, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { AgentAvatar } from "@/components/domain";
import { Dropdown, Tooltip } from "@/components/ui/overlay";
import { cx } from "@/components/ui/primitives";
import { useAgents, useCompanies, useInbox, useMailboxes } from "@/lib/queries";
import type { Agent, Company } from "@/lib/types";
import { Logo } from "./logo";
import { SECTIONS, sectionOf, type NavSection } from "./nav";

function CompanySwitcher({ company, collapsed }: { company: Company; collapsed: boolean }) {
  const companies = useCompanies();
  const router = useRouter();
  const others = (companies.data ?? []).filter((c) => c.id !== company.id);
  return (
    <Dropdown
      align="start"
      label="Companies"
      trigger={
        <button
          type="button"
          aria-label={`Company: ${company.name}. Switch company`}
          className={cx(
            "flex h-9 min-w-0 items-center gap-2.5 rounded-lg text-left transition-colors duration-[120ms] hover:bg-hover aria-expanded:bg-hover",
            collapsed ? "w-9 justify-center" : "w-full px-1.5",
          )}
        >
          <Logo className="size-5 shrink-0 text-fg" title="" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{company.name}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-faint" aria-hidden />
            </>
          )}
        </button>
      }
      items={[
        { label: company.name, icon: <Check aria-hidden />, onSelect: () => undefined },
        ...others.map((c) => ({ label: c.name, onSelect: () => router.push(`/c/${c.id}/overview`) })),
        "separator" as const,
        { label: "New company…", icon: <Plus aria-hidden />, onSelect: () => router.push("/new") },
        { label: "Open the demo company", icon: <Sparkles aria-hidden />, onSelect: () => router.push("/?demo=1") },
        { label: "All companies…", icon: <Building2 aria-hidden />, onSelect: () => router.push("/") },
      ]}
    />
  );
}

/** One row of the sidebar: same rhythm for places, agents and actions. */
function Row({ href, label, icon, active, collapsed, trailing, onNavigate }: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
  trailing?: ReactNode;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex h-8 items-center gap-2.5 rounded-lg text-compact font-medium transition-[background-color,color] duration-[120ms] ease-out",
        collapsed ? "mx-auto w-9 justify-center" : "px-2",
        active ? "bg-press text-fg" : "text-fg/80 hover:bg-hover hover:text-fg",
      )}
    >
      {icon}
      {collapsed ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {trailing}
    </Link>
  );
  return <li className="relative">{collapsed ? <Tooltip content={label} side="right">{link}</Tooltip> : link}</li>;
}

function Count({ value, collapsed }: { value?: number; collapsed: boolean }) {
  if (!value) return null;
  if (collapsed) return <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-supervised" aria-hidden />;
  return <span className="min-w-5 rounded-md bg-surface-2 px-1.5 text-center text-micro font-medium tabular text-muted" aria-label={`${value} waiting`}>{value}</span>;
}

/** A blue pulse when the agent has a run queued or running, as in "working right now". */
function Working({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (!count) return null;
  const dot = (
    <span className="relative flex size-2" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-sampled/60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-sampled" />
    </span>
  );
  if (collapsed) return <span className="absolute top-1 right-1.5">{dot}</span>;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-micro font-medium text-sampled">
      {dot}
      {count > 1 ? `${count} working` : "working"}
    </span>
  );
}

function SectionLabel({ children, action, collapsed }: { children: ReactNode; action?: ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-6 bg-line-soft" aria-hidden />;
  return (
    <div className="flex h-7 items-center justify-between px-2 pt-2">
      <p className="font-mono text-nano font-medium tracking-widest text-muted uppercase">{children}</p>
      {action}
    </div>
  );
}

function AgentRow({ agent, companyId, collapsed, onNavigate }: { agent: Agent; companyId: string; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const href = `/c/${companyId}/agents/${agent.id}`;
  return (
    <Row
      href={href}
      label={agent.name}
      collapsed={collapsed}
      active={pathname === href || pathname.startsWith(`${href}/`)}
      onNavigate={onNavigate}
      icon={<AgentAvatar name={agent.name} size="xs" />}
      trailing={
        agent.working ? (
          <Working count={agent.working} collapsed={collapsed} />
        ) : agent.status === "paused" && !collapsed ? (
          <span className="ml-auto text-micro text-faint">paused</span>
        ) : null
      }
    />
  );
}

export function Sidebar({ company, collapsed, onToggle, onNavigate, onNewTask }: {
  company: Company;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onNewTask?: () => void;
}) {
  const pathname = usePathname();
  const inbox = useInbox(company.id);
  const agents = useAgents(company.id);
  const mailboxes = useMailboxes(company.id);
  const counts = inbox.data?.counts;
  const badge: Record<string, number | undefined> = {
    approvals: counts?.approvals,
    messages: counts ? (counts.messages ?? 0) + (counts.deliveries ?? 0) : undefined,
  };
  const hasMail = (mailboxes.data?.length ?? 0) > 0 || !!badge.messages;
  const current = sectionOf(pathname.split("/")[3]);
  const canWrite = company.role !== "viewer";
  const canAdmin = company.role === "owner" || company.role === "admin";
  const visible = SECTIONS.filter((s) => !s.needsMailbox || hasMail);
  const team = (agents.data ?? []).filter((a) => a.status !== "archived");

  const place = (s: NavSection) => (
    <Row
      key={s.href}
      href={`/c/${company.id}/${s.href}`}
      label={s.label}
      collapsed={collapsed}
      active={current?.href === s.href && !pathname.includes("/agents/")}
      onNavigate={onNavigate}
      icon={<s.icon className="size-4 shrink-0" aria-hidden />}
      trailing={<Count value={badge[s.href]} collapsed={collapsed} />}
    />
  );

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar">
      <div className={cx("flex h-12 shrink-0 items-center", collapsed ? "justify-center px-2" : "px-2.5")}>
        <CompanySwitcher company={company} collapsed={collapsed} />
      </div>

      {company.emergency_stop && (
        <div className={cx("mb-1 flex items-center gap-2 rounded-lg border border-danger/35 bg-danger/10 text-xs text-danger", collapsed ? "mx-2 justify-center py-1.5" : "mx-2.5 px-2.5 py-1.5")} role="status">
          <OctagonX className="size-3.5 shrink-0" aria-hidden />
          {collapsed ? <span className="sr-only">Emergency stop is on</span> : "Emergency stop is on"}
        </div>
      )}

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="space-y-px pt-1">
          {canWrite && onNewTask && (
            <li>
              {(() => {
                const button = (
                  <button
                    type="button"
                    onClick={() => { onNavigate?.(); onNewTask(); }}
                    className={cx(
                      "flex h-8 items-center gap-2.5 rounded-lg text-compact font-medium text-fg/80 transition-colors duration-[120ms] hover:bg-hover hover:text-fg",
                      collapsed ? "mx-auto w-9 justify-center" : "w-full px-2",
                    )}
                  >
                    <SquarePen className="size-4 shrink-0" aria-hidden />
                    {collapsed ? <span className="sr-only">New task</span> : <span className="flex-1 text-left">New task</span>}
                  </button>
                );
                return collapsed ? <Tooltip content="New task (C)" side="right">{button}</Tooltip> : button;
              })()}
            </li>
          )}
          {visible.map(place)}
        </ul>

        <SectionLabel
          collapsed={collapsed}
          action={canAdmin && !company.is_demo ? (
            <Link href={`/c/${company.id}/agents?new=1`} onClick={onNavigate} aria-label="Add an agent" className="flex size-5 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-fg">
              <Plus className="size-3.5" aria-hidden />
            </Link>
          ) : undefined}
        >
          Agents
        </SectionLabel>
        <ul className="space-y-px">
          {team.map((a) => <AgentRow key={a.id} agent={a} companyId={company.id} collapsed={collapsed} onNavigate={onNavigate} />)}
          {agents.data && team.length === 0 && !collapsed && (
            <li className="px-2 py-1 text-xs text-faint">No agent yet</li>
          )}
        </ul>
      </div>

      {onToggle && (
        <div className="shrink-0 border-t border-line-soft px-2 py-2 max-lg:hidden">
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "flex h-8 items-center gap-2.5 rounded-lg text-compact text-faint transition-colors duration-[120ms] hover:bg-hover hover:text-fg",
              collapsed ? "mx-auto w-9 justify-center" : "w-full px-2",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar (Ctrl B)" : "Collapse sidebar (Ctrl B)"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <><PanelLeftClose className="size-4" aria-hidden /> <span className="flex-1 text-left">Collapse</span></>}
          </button>
        </div>
      )}
    </nav>
  );
}
