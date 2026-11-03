"use client";

import { ChevronsLeft, ChevronsRight, OctagonX } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip } from "@/components/ui/overlay";
import { cx } from "@/components/ui/primitives";
import { useInbox } from "@/lib/queries";
import type { Company } from "@/lib/types";
import { Logo } from "./logo";
import { NAV } from "./nav";

export function Sidebar({ company, collapsed, onToggle, onNavigate }: {
  company: Company;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const inbox = useInbox(company.id);
  const counts = inbox.data?.counts;
  const badge: Record<string, number | undefined> = {
    inbox: inbox.data ? inbox.data.items.length : undefined,
    approvals: counts?.approvals,
  };
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar">
      <div className={cx("flex h-12 items-center border-b border-line", collapsed ? "justify-center" : "px-4")}>
        <Link href="/" className="flex items-center gap-2 text-fg" aria-label="Select home">
          <Logo className="size-5" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Select</span>}
        </Link>
      </div>
      {company.emergency_stop && !collapsed && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          <OctagonX className="size-3.5" aria-hidden /> Emergency stop is on
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {NAV.map((group) => (
          <div key={group.group} className="mb-2">
            {!collapsed && <p className="px-4 pt-2 pb-1 text-2xs font-medium tracking-wider text-faint uppercase">{group.group}</p>}
            <ul>
              {group.items.map((item) => {
                const href = `/c/${company.id}/${item.href}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                const count = badge[item.href];
                const link = (
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "mx-2 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                      active ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <item.icon className={cx("size-4 shrink-0", active ? "text-accent" : "")} aria-hidden />
                    {collapsed ? <span className="sr-only">{item.label}</span> : <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && count ? <span className="rounded-sm bg-raised px-1.5 text-2xs tabular text-muted">{count}</span> : null}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 items-center gap-2 border-t border-line px-4 text-xs text-faint hover:text-fg max-lg:hidden"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="mx-auto size-4" aria-hidden /> : <><ChevronsLeft className="size-4" aria-hidden /> Collapse</>}
        </button>
      )}
    </nav>
  );
}
