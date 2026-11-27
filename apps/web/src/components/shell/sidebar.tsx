"use client";

import { Building2, Check, ChevronsUpDown, OctagonX, PanelLeftClose, PanelLeftOpen, Plus, Search, SquarePen, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { AgentAvatar, ProjectDot } from "@/components/domain";
import { Dropdown, Tooltip } from "@/components/ui/overlay";
import { cx } from "@/components/ui/primitives";
import { useAgents, useCompanies, useInbox, useMailboxes, useProjects } from "@/lib/queries";
import type { Agent, Company, Project } from "@/lib/types";
import { BrandMark } from "./logo";
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
            "group flex min-w-0 items-center gap-1.5 text-left select-none",
            collapsed ? "size-9 justify-center" : "w-full px-0.5",
          )}
        >
          <BrandMark className="size-[22px] shrink-0" />
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[17px] tracking-[-0.2px]">
              <span className="font-bold text-white">select</span>
              <span className="min-w-0 truncate font-light text-brand-sub">{company.name.toLowerCase()}</span>
            </span>
          )}
          {!collapsed && <ChevronsUpDown className="size-3.5 shrink-0 text-ghost opacity-0 transition-opacity group-hover:opacity-100 group-aria-expanded:opacity-100" aria-hidden />}
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
function Row({ href, label, icon, active, collapsed, trailing, onNavigate, plainIcon }: {
  /** Agents and projects keep their avatar or dot; places are words only, as in Whale. */
  plainIcon?: boolean;
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
        "group relative flex items-center gap-2.5 transition-colors duration-[120ms] ease-out",
        collapsed ? "mx-auto h-8 w-9 justify-center rounded-md hover:bg-hover" : "h-[30px] px-2.5 text-sm",
        active ? "font-semibold text-white" : "text-nav hover:text-white",
        !collapsed && active && "before:absolute before:top-[6px] before:bottom-[6px] before:left-0 before:w-[2px] before:bg-nav-active",
      )}
    >
      {(collapsed || plainIcon) && icon}
      {collapsed ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {trailing}
    </Link>
  );
  return <li className="relative">{collapsed ? <Tooltip content={label} side="right">{link}</Tooltip> : link}</li>;
}

function Count({ value, collapsed }: { value?: number; collapsed: boolean }) {
  if (!value) return null;
  if (collapsed) return <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-supervised" aria-hidden />;
  return <span className="min-w-5 text-right text-xs tabular text-fg" aria-label={`${value} waiting`}>{value}</span>;
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
    <div className="flex h-7 items-center justify-between px-2.5 pt-3">
      <p className="text-nano font-medium tracking-[0.12em] text-fg uppercase">{children}</p>
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
      plainIcon
      icon={<AgentAvatar name={agent.name} role={agent.role} size="xs" />}
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

function ProjectRow({ project, companyId, collapsed, onNavigate }: { project: Project; companyId: string; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Row
      href={`/c/${companyId}/tasks?project=${project.id}`}
      label={project.name}
      collapsed={collapsed}
      active={pathname.endsWith("/tasks") && params.get("project") === project.id}
      onNavigate={onNavigate}
      plainIcon
      icon={<span className="flex size-4 shrink-0 items-center justify-center"><ProjectDot id={project.id} /></span>}
      trailing={!collapsed && project.task_count ? <span className="text-micro text-faint tabular">{project.task_count}</span> : null}
    />
  );
}

export function Sidebar({ company, collapsed, onToggle, onNavigate, onNewTask, onSearch }: {
  /** Opens the command palette: "Ask or search", as in Whale. */
  onSearch?: () => void;
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
  const projects = useProjects(company.id);
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
  const openProjects = (projects.data ?? []).filter((p) => p.status !== "done").slice(0, 8);
  const working = team.reduce((n, a) => n + (a.working ?? 0), 0);

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
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className={cx("shrink-0", collapsed ? "flex flex-col items-center px-2 pt-3" : "px-3 pt-[18px]")}>
        <CompanySwitcher company={company} collapsed={collapsed} />
        {!collapsed && <div className="mx-0.5 mt-1.5 mb-4 h-[2px] w-[34px] rounded-sm bg-white" aria-hidden />}
        {onSearch && (collapsed ? (
          <Tooltip content="Ask or search (Ctrl K)" side="right">
            <button type="button" onClick={onSearch} aria-label="Ask or search" className="my-3 flex size-9 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-fg">
              <Search className="size-4" aria-hidden />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => { onNavigate?.(); onSearch(); }}
            className="mb-5 flex w-full items-center justify-between gap-1.5 rounded-[2px] border border-line-control px-2 py-1.5 text-left text-xs text-fg transition-colors hover:border-ghost hover:text-white"
          >
            <span>Ask or search</span>
            <kbd className="font-sans text-[11px] whitespace-nowrap text-muted">Ctrl K</kbd>
          </button>
        ))}
      </div>

      {company.emergency_stop && (
        <div className={cx("mb-1 flex items-center gap-2 rounded-lg border border-danger/35 bg-danger/10 text-xs text-danger", collapsed ? "mx-2 justify-center py-1.5" : "mx-2.5 px-2.5 py-1.5")} role="status">
          <OctagonX className="size-3.5 shrink-0" aria-hidden />
          {collapsed ? <span className="sr-only">Emergency stop is on</span> : "Emergency stop is on"}
        </div>
      )}

      <div className={cx("scrollbar-none min-h-0 flex-1 overflow-y-auto pb-3", collapsed ? "px-2" : "px-3")}>
        <ul className="pt-1">
          {visible.map(place)}
        </ul>
        <ul className="mt-5">
          {canWrite && onNewTask && (
            <li>
              {(() => {
                const button = (
                  <button
                    type="button"
                    onClick={() => { onNavigate?.(); onNewTask(); }}
                    className={cx(
                      "flex items-center gap-2.5 text-nav transition-colors duration-[120ms] hover:text-white",
                      collapsed ? "mx-auto h-8 w-9 justify-center rounded-md hover:bg-hover" : "h-[30px] w-full px-2.5 text-sm",
                    )}
                  >
                    {collapsed && <SquarePen className="size-4 shrink-0" aria-hidden />}
                    {collapsed ? <span className="sr-only">New task</span> : <span className="flex-1 text-left">New task</span>}
                  </button>
                );
                return collapsed ? <Tooltip content="New task (C)" side="right">{button}</Tooltip> : button;
              })()}
            </li>
          )}
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

        {openProjects.length > 0 && (
          <>
            <SectionLabel
              collapsed={collapsed}
              action={
                <Link href={`/c/${company.id}/projects`} onClick={onNavigate} aria-label="All projects" className="flex size-5 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-fg">
                  <Plus className="size-3.5" aria-hidden />
                </Link>
              }
            >
              Projects
            </SectionLabel>
            <ul className="space-y-px">
              {openProjects.map((p) => <ProjectRow key={p.id} project={p} companyId={company.id} collapsed={collapsed} onNavigate={onNavigate} />)}
            </ul>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="shrink-0 px-3.5">
          <p className="truncate pb-2 text-[10px] text-ghost">
            {team.length} agent{team.length === 1 ? "" : "s"} · {company.name}{company.is_demo ? " · demo" : ""}
          </p>
          <p className={cx("flex items-center gap-1.5 border-t border-line-strong pt-2.5 pb-1 text-[10px] tracking-[0.12em] uppercase", working ? "text-white" : "text-muted")} role="status">
            {working > 0 && <span className="size-1.5 animate-pulse rounded-full bg-live" aria-hidden />}
            {company.emergency_stop ? "Emergency stop on" : working ? `${working} agent run${working === 1 ? "" : "s"} now` : "No agent running now"}
          </p>
        </div>
      )}
      {onToggle && (
        <div className={cx("shrink-0 py-2 max-lg:hidden", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "flex h-7 items-center gap-2.5 rounded-md text-xs text-ghost transition-colors duration-[120ms] hover:bg-hover hover:text-fg",
              collapsed ? "mx-auto w-9 justify-center" : "w-full px-2.5",
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
