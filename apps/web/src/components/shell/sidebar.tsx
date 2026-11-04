"use client";

import { Building2, Check, ChevronsUpDown, OctagonX, PanelLeftClose, PanelLeftOpen, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Dropdown, Tooltip } from "@/components/ui/overlay";
import { cx } from "@/components/ui/primitives";
import { useCompanies, useInbox } from "@/lib/queries";
import type { Company } from "@/lib/types";
import { Logo } from "./logo";
import { NAV, NAV_FOOT, type NavItem } from "./nav";

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
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-fg text-canvas">
            <Logo className="size-3.5" title="" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-fg">{company.name}</span>
              </span>
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

function NavLink({ item, companyId, collapsed, count, onNavigate }: { item: NavItem; companyId: string; collapsed: boolean; count?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const href = `/c/${companyId}/${item.href}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group flex h-[30px] items-center gap-2.5 rounded-[7px] text-[13px] transition-[background-color,color] duration-[120ms] ease-out",
        collapsed ? "mx-auto w-9 justify-center" : "px-2",
        active ? "bg-[rgb(255_255_255/0.075)] font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      <item.icon className={cx("size-4 shrink-0 transition-colors duration-[120ms]", active ? "text-accent" : "text-faint group-hover:text-muted")} aria-hidden />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && count ? (
        <span className="min-w-5 rounded-[5px] bg-surface-2 px-1.5 text-center text-2xs leading-[18px] font-medium tabular text-muted" aria-label={`${count} waiting`}>{count}</span>
      ) : null}
      {collapsed && count ? <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-supervised" aria-hidden /> : null}
    </Link>
  );
  return <li className="relative">{collapsed ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link}</li>;
}

export function Sidebar({ company, collapsed, onToggle, onNavigate }: {
  company: Company;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const inbox = useInbox(company.id);
  const counts = inbox.data?.counts;
  const badge: Record<string, number | undefined> = {
    inbox: inbox.data ? inbox.data.items.length : undefined,
    approvals: counts?.approvals,
    messages: counts ? (counts.messages ?? 0) + (counts.deliveries ?? 0) : undefined,
  };
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
        {NAV.map((group, gi) => (
          <div key={group.group ?? gi} className={gi === 0 ? "pt-1" : "pt-4"}>
            {group.group && !collapsed && <p className="px-2 pb-1 text-xs font-medium text-faint">{group.group}</p>}
            {group.group && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-line-soft" aria-hidden />}
            <ul className="space-y-px">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} companyId={company.id} collapsed={collapsed} count={badge[item.href]} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line-soft px-2 py-2">
        <ul className="space-y-px">
          {NAV_FOOT.map((item) => (
            <NavLink key={item.href} item={item} companyId={company.id} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </ul>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "mt-1 flex h-[30px] items-center gap-2.5 rounded-[7px] text-[13px] text-faint transition-colors duration-[120ms] hover:bg-hover hover:text-fg max-lg:hidden",
              collapsed ? "mx-auto w-9 justify-center" : "w-full px-2",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar (Ctrl B)" : "Collapse sidebar (Ctrl B)"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <><PanelLeftClose className="size-4" aria-hidden /> <span className="flex-1 text-left">Collapse</span></>}
          </button>
        )}
      </div>
    </nav>
  );
}
