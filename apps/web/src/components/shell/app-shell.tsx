"use client";

import * as RDialog from "@radix-ui/react-dialog";
import { Bell, Check, ChevronDown, Loader2, Menu, OctagonX, Search, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { relative } from "@/lib/format";
import { api } from "@/lib/api";
import { useAction, useCompanies, useCompany, useInbox, useOverview, usePersistentState } from "@/lib/queries";
import type { Company } from "@/lib/types";
import { DemoBanner, ErrorState, LoadingRows } from "../ui/feedback";
import { ConfirmDialog, Dropdown, Popover } from "../ui/overlay";
import { Button, IconButton, Kbd, cx } from "../ui/primitives";
import { CommandPalette } from "./command-palette";
import { NAV_FLAT } from "./nav";
import { Sidebar } from "./sidebar";

function Breadcrumb({ company }: { company: Company }) {
  const pathname = usePathname();
  const parts = pathname.split("/").slice(3);
  const section = NAV_FLAT.find((n) => n.href === parts[0]);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="hidden truncate text-muted sm:inline">{company.name}</span>
      {section && (
        <>
          <span className="hidden text-faint sm:inline" aria-hidden>/</span>
          <Link href={`/c/${company.id}/${section.href}`} className={cx("truncate", parts.length > 1 ? "text-muted hover:text-fg" : "text-fg")}>
            {section.label}
          </Link>
        </>
      )}
      {parts.length > 1 && (
        <>
          <span className="text-faint" aria-hidden>/</span>
          <span className="truncate text-fg" aria-current="page">Details</span>
        </>
      )}
    </nav>
  );
}

function CompanySwitcher({ company }: { company: Company }) {
  const companies = useCompanies();
  const router = useRouter();
  const others = (companies.data ?? []).filter((c) => c.id !== company.id);
  return (
    <Dropdown
      align="start"
      trigger={
        <Button size="sm" variant="ghost" className="max-w-48 text-fg" aria-label="Switch company">
          <span className="truncate">{company.name}</span>
          <ChevronDown className="size-3.5 text-faint" aria-hidden />
        </Button>
      }
      items={[
        { label: company.name, icon: <Check className="size-3.5" aria-hidden />, onSelect: () => undefined },
        ...others.map((c) => ({ label: c.name, onSelect: () => router.push(`/c/${c.id}/overview`) })),
        "separator" as const,
        { label: "All companies…", onSelect: () => router.push("/") },
      ]}
    />
  );
}

function Notifications({ company }: { company: Company }) {
  const inbox = useInbox(company.id);
  const items = inbox.data?.items ?? [];
  return (
    <Popover
      trigger={
        <IconButton label={`Notifications${items.length ? `, ${items.length} waiting` : ""}`} className="relative">
          <Bell className="size-4" aria-hidden />
          {items.length > 0 && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-supervised" aria-hidden />}
        </IconButton>
      }
    >
      <div className="border-b border-line px-3.5 py-2.5 text-sm font-medium">Needs you</div>
      <ul className="max-h-80 overflow-y-auto">
        {items.length === 0 && <li className="px-3.5 py-6 text-center text-sm text-muted">Nothing is waiting for you.</li>}
        {items.slice(0, 8).map((item) => (
          <li key={`${item.kind}-${item.id}`} className="border-b border-line/60 last:border-0">
            <Link
              href={item.task_id ? `/c/${company.id}/tasks/${item.task_id}` : item.agent_id ? `/c/${company.id}/agents/${item.agent_id}` : `/c/${company.id}/inbox`}
              className="block px-3.5 py-2.5 hover:bg-hover"
            >
              <p className="truncate text-sm text-fg">{item.title}</p>
              <p className="truncate text-xs text-muted">{item.detail} · {relative(item.created_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={`/c/${company.id}/inbox`} className="block border-t border-line px-3.5 py-2 text-center text-xs text-accent hover:text-accent-strong">Open inbox</Link>
    </Popover>
  );
}

function RunningIndicator({ company }: { company: Company }) {
  const overview = useOverview(company.id, 7);
  const running = overview.data?.tasks.in_progress ?? 0;
  if (!running) return null;
  return (
    <Link href={`/c/${company.id}/tasks`} className="hidden items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg md:inline-flex">
      <Loader2 className="size-3 animate-spin text-accent" aria-hidden />
      <span className="tabular">{running}</span> in progress
    </Link>
  );
}

export function AppShell({ cid, children }: { cid: string; children: ReactNode }) {
  const company = useCompany(cid);
  const [collapsed, setCollapsed] = usePersistentState("sidebar.collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const stop = useAction(cid, (on: boolean) => api<Company>(`/companies/${cid}/emergency-stop`, { method: "POST", query: { on } }), {
    success: (c) => (c.emergency_stop ? "Emergency stop on: queued runs cancelled" : "Emergency stop lifted"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  if (company.isPending) return <div className="p-6"><LoadingRows rows={8} /></div>;
  if (company.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState error={company.error} retry={() => void company.refetch()} />
      </div>
    );
  }
  const c = company.data;
  const toggleStop = () => stop.mutate(!c.emergency_stop);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-md focus:bg-raised focus:px-3 focus:py-2">Skip to content</a>
      <aside className={cx("sticky top-0 hidden h-dvh shrink-0 border-r border-line lg:block", collapsed ? "w-14" : "w-56")}>
        <Sidebar company={c} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      <RDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <RDialog.Portal>
          <RDialog.Overlay className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
          <RDialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] animate-fade-in border-r border-line lg:hidden" aria-label="Navigation">
            <RDialog.Title className="sr-only">Navigation</RDialog.Title>
            <RDialog.Description className="sr-only">Main navigation</RDialog.Description>
            <Sidebar company={c} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-canvas/95 px-3 backdrop-blur-sm sm:px-4">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-4" aria-hidden />
          </IconButton>
          <div className="hidden md:block"><CompanySwitcher company={c} /></div>
          <span className="hidden h-4 w-px bg-line md:block" aria-hidden />
          <Breadcrumb company={c} />
          <div className="ml-auto flex items-center gap-1.5">
            <RunningIndicator company={c} />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2 text-xs text-faint hover:border-line-strong hover:text-muted sm:w-56"
              aria-label="Search (Ctrl K)"
            >
              <Search className="size-3.5" aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Search…</span>
              <span className="hidden sm:inline"><Kbd>Ctrl K</Kbd></span>
            </button>
            {c.role !== "viewer" && (
              <ConfirmDialog
                trigger={
                  <IconButton label={c.emergency_stop ? "Lift emergency stop" : "Emergency stop"} className={c.emergency_stop ? "text-danger" : undefined}>
                    <OctagonX className="size-4" aria-hidden />
                  </IconButton>
                }
                title={c.emergency_stop ? "Lift the emergency stop?" : "Stop all agent work now?"}
                description={c.emergency_stop ? "Agents can start runs again. Nothing queued before the stop is restarted automatically." : "Every queued run is cancelled and no new run or submission is accepted until you lift the stop."}
                confirmLabel={c.emergency_stop ? "Lift stop" : "Stop everything"}
                danger={!c.emergency_stop}
                onConfirm={() => stop.mutateAsync(!c.emergency_stop)}
              />
            )}
            <Notifications company={c} />
            <Dropdown
              trigger={
                <button type="button" className="ml-1 flex size-7 items-center justify-center rounded-full border border-line bg-raised text-2xs font-semibold text-muted hover:text-fg" aria-label="Account menu">
                  {c.role.slice(0, 1).toUpperCase()}
                </button>
              }
              items={[
                { label: `Role: ${c.role}`, onSelect: () => undefined, disabled: true },
                { label: "Settings & API token", icon: <Settings className="size-3.5" aria-hidden />, onSelect: () => router.push(`/c/${c.id}/settings`) },
                { label: "Open the demo company", icon: <Sparkles className="size-3.5" aria-hidden />, onSelect: () => router.push("/?demo=1") },
              ]}
            />
          </div>
        </header>
        {c.is_demo && <DemoBanner />}
        <main id="main" className="min-w-0 flex-1" key={pathname}>
          {children}
        </main>
      </div>
      <CommandPalette company={c} open={paletteOpen} onOpenChange={setPaletteOpen} onToggleStop={toggleStop} />
    </div>
  );
}

export function PageHeader({ title, description, actions, meta }: { title: string; description?: string; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("space-y-4 px-4 py-4 sm:px-6 sm:py-5", className)}>{children}</div>;
}
