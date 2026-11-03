"use client";

import * as RDialog from "@radix-ui/react-dialog";
import { Bell, ChevronRight, ClipboardCheck, Gauge, Inbox, Keyboard, ListTodo, Loader2, MoreHorizontal, OctagonX, Search, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { relative } from "@/lib/format";
import { api } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks";
import { useAction, useCompany, useInbox, useOverview, usePersistentState } from "@/lib/queries";
import type { Company } from "@/lib/types";
import { DemoBanner, ErrorState, LoadingRows } from "../ui/feedback";
import { ConfirmDialog, Dialog, Dropdown, Popover } from "../ui/overlay";
import { IconButton, Kbd, cx } from "../ui/primitives";
import { CommandPalette } from "./command-palette";
import { NAV_FLAT } from "./nav";
import { Sidebar } from "./sidebar";

/* ───────────── Topbar slots: pages put their title and actions in the shell's thin topbar ───────────── */

interface Slots { title: HTMLElement | null; actions: HTMLElement | null }
const SlotContext = createContext<Slots>({ title: null, actions: null });

const subscribeNoop = () => () => undefined;
/** "⌘" on Apple platforms, "Ctrl" elsewhere. Server render assumes Ctrl. */
export function useModKey(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role='dialog']") !== null;
}

function Crumbs({ company }: { company: Company }) {
  const pathname = usePathname();
  const parts = pathname.split("/").slice(3);
  const section = NAV_FLAT.find((n) => n.href === parts[0]);
  if (!section || parts.length < 2) return null;
  return (
    <>
      <Link href={`/c/${company.id}/${section.href}`} className="shrink-0 rounded-md px-1 py-0.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg">
        {section.label}
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-ghost" aria-hidden />
    </>
  );
}

function Notifications({ company }: { company: Company }) {
  const inbox = useInbox(company.id);
  const items = inbox.data?.items ?? [];
  return (
    <Popover
      className="w-[340px]"
      trigger={
        <IconButton label={`Notifications${items.length ? `, ${items.length} waiting` : ""}`} className="relative">
          <Bell className="size-4" aria-hidden />
          {items.length > 0 && <span className="absolute top-[5px] right-[5px] size-1.5 rounded-full bg-supervised ring-2 ring-canvas" aria-hidden />}
        </IconButton>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <span className="text-[13px] font-semibold">Needs you</span>
        <span className="text-xs text-faint tabular">{items.length}</span>
      </div>
      <ul className="max-h-80 overflow-y-auto p-1">
        {items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing is waiting for you.</li>}
        {items.slice(0, 8).map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              href={item.task_id ? `/c/${company.id}/tasks/${item.task_id}` : item.agent_id ? `/c/${company.id}/agents/${item.agent_id}` : `/c/${company.id}/inbox`}
              className="block rounded-md px-2.5 py-2 hover:bg-hover"
            >
              <p className="truncate text-[13px] text-fg">{item.title}</p>
              <p className="truncate text-xs text-muted">{item.detail} · {relative(item.created_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={`/c/${company.id}/inbox`} className="block border-t border-line px-3.5 py-2 text-center text-xs font-medium text-accent hover:text-accent-strong">Open inbox</Link>
    </Popover>
  );
}

function RunningIndicator({ company }: { company: Company }) {
  const overview = useOverview(company.id, 7);
  const running = overview.data?.tasks.in_progress ?? 0;
  if (!running) return null;
  return (
    <Link href={`/c/${company.id}/tasks`} className="hidden h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-fg xl:inline-flex">
      <Loader2 className="size-3 animate-spin text-accent" aria-hidden />
      <span className="tabular">{running}</span> running
    </Link>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ K", "Search and commands"],
  ["Ctrl / ⌘ B", "Collapse the sidebar"],
  ["G then O", "Overview"],
  ["G then I", "Inbox"],
  ["G then T", "Tasks"],
  ["G then A", "Approvals"],
  ["G then E", "Agents"],
  ["G then U", "Autonomy"],
  ["G then V", "Verification"],
  ["G then C", "Costs"],
  ["G then S", "Settings"],
  ["C", "New task (on Tasks)"],
  ["J / K or ↓ / ↑", "Move through the task list"],
  ["Enter", "Open the selected item"],
  ["?", "This list"],
];

function MobileTabs({ company, onMore }: { company: Company; onMore: () => void }) {
  const pathname = usePathname();
  const inbox = useInbox(company.id);
  const counts = inbox.data?.counts;
  const tabs = [
    { href: "overview", label: "Overview", icon: Gauge },
    { href: "inbox", label: "Inbox", icon: Inbox, count: inbox.data?.items.length },
    { href: "approvals", label: "Approvals", icon: ClipboardCheck, count: counts?.approvals },
    { href: "tasks", label: "Tasks", icon: ListTodo },
  ];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((tab) => {
          const href = `/c/${company.id}/${tab.href}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cx("relative flex h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium", active ? "text-fg" : "text-faint")}>
                <tab.icon className={cx("size-5", active && "text-accent")} aria-hidden />
                {tab.label}
                {tab.count ? <span className="absolute top-1.5 left-[calc(50%+6px)] min-w-4 rounded-full bg-supervised px-1 text-center text-[10px] leading-4 font-semibold text-canvas tabular">{tab.count}</span> : null}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-2xs font-medium text-faint">
            <MoreHorizontal className="size-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell({ cid, children }: { cid: string; children: ReactNode }) {
  const company = useCompany(cid);
  const [collapsed, setCollapsed] = usePersistentState("sidebar.collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [slots, setSlots] = useState<Slots>({ title: null, actions: null });
  // Stable callback refs: called once on mount and once on unmount, never on every render.
  const titleSlot = useCallback((el: HTMLDivElement | null) => setSlots((s) => (s.title === el ? s : { ...s, title: el })), []);
  const actionsSlot = useCallback((el: HTMLDivElement | null) => setSlots((s) => (s.actions === el ? s : { ...s, actions: el })), []);
  const pendingG = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const mod = useModKey();
  const stop = useAction(cid, (on: boolean) => api<Company>(`/companies/${cid}/emergency-stop`, { method: "POST", query: { on } }), {
    success: (c) => (c.emergency_stop ? "Emergency stop on: queued runs cancelled" : "Emergency stop lifted"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed(!collapsed);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      const now = Date.now();
      if (now - pendingG.current < 900) {
        pendingG.current = 0;
        const target = NAV_FLAT.find((n) => n.key === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          router.push(`/c/${cid}/${target.href}`);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") pendingG.current = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cid, collapsed, router, setCollapsed]);

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
    <SlotContext.Provider value={slots}>
      <div className="flex h-dvh overflow-hidden">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-lg focus:bg-raised focus:px-3 focus:py-2 focus:text-[13px]">Skip to content</a>
        <aside className={cx("hidden h-full shrink-0 border-r border-line-soft lg:block", collapsed ? "w-14" : "w-[232px]")}>
          <Sidebar company={c} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        </aside>
        <RDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <RDialog.Portal>
            <RDialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out lg:hidden" />
            <RDialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line shadow-[var(--shadow-dialog)] data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out lg:hidden" aria-label="Navigation">
              <RDialog.Title className="sr-only">Navigation</RDialog.Title>
              <RDialog.Description className="sr-only">Main navigation</RDialog.Description>
              <Sidebar company={c} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line-soft bg-canvas px-3 sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Crumbs company={c} />
              <div ref={titleSlot} className="flex min-w-0 items-center gap-2" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div ref={actionsSlot} className="mr-1 flex items-center gap-1.5 empty:hidden" />
              <RunningIndicator company={c} />
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex h-7 items-center gap-2 rounded-lg border border-line bg-surface px-2 text-[13px] text-faint transition-colors duration-[120ms] hover:border-line-strong hover:text-muted max-sm:w-7 max-sm:justify-center max-sm:px-0 sm:w-48"
                aria-label={`Search (${mod} K)`}
              >
                <Search className="size-3.5 shrink-0" aria-hidden />
                <span className="hidden flex-1 text-left sm:inline">Search…</span>
                <span className="hidden sm:inline-flex"><Kbd>{mod} K</Kbd></span>
              </button>
              {c.role !== "viewer" && (
                <ConfirmDialog
                  trigger={
                    <IconButton label={c.emergency_stop ? "Lift emergency stop" : "Emergency stop"} className={c.emergency_stop ? "text-danger hover:text-danger" : undefined}>
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
                label="Account"
                trigger={
                  <button type="button" className="ml-1 flex size-7 items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-muted ring-1 ring-line transition-colors hover:text-fg" aria-label="Account menu">
                    {c.role.slice(0, 1).toUpperCase()}
                  </button>
                }
                items={[
                  { label: `Signed in as ${c.role}`, onSelect: () => undefined, disabled: true },
                  "separator",
                  { label: "Settings & API token", icon: <Settings aria-hidden />, onSelect: () => router.push(`/c/${c.id}/settings`) },
                  { label: "Keyboard shortcuts", icon: <Keyboard aria-hidden />, hint: "?", onSelect: () => setHelpOpen(true) },
                  { label: "Open the demo company", icon: <Sparkles aria-hidden />, onSelect: () => router.push("/?demo=1") },
                ]}
              />
            </div>
          </header>
          {c.is_demo && <DemoBanner />}
          <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] focus:outline-none lg:pb-0">
            <div key={pathname} className="flex flex-1 animate-rise-in flex-col">{children}</div>
          </main>
        </div>
        <MobileTabs company={c} onMore={() => setMobileOpen(true)} />
        <CommandPalette
          company={c}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onToggleStop={toggleStop}
          onToggleSidebar={() => setCollapsed(!collapsed)}
          onShowShortcuts={() => setHelpOpen(true)}
        />
        <Dialog open={helpOpen} onOpenChange={setHelpOpen} title="Keyboard shortcuts" description="Shortcuts work anywhere outside a text field.">
          <dl className="divide-y divide-line-soft">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-[13px] text-muted">{action}</dt>
                <dd className="flex gap-1">{keys.split(" then ").map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      </div>
    </SlotContext.Provider>
  );
}

/**
 * The page's title (h1), short description and actions live in the topbar, so the content starts with content.
 * On phones the actions move to a row at the top of the page.
 */
export function PageHeader({ title, description, actions, meta }: { title: string; description?: string; actions?: ReactNode; meta?: ReactNode }) {
  const slots = useContext(SlotContext);
  // Mount the actions once: in the topbar on laptops and desktops, in a row above the content on tablets and phones.
  const desktop = useMediaQuery("(min-width: 1024px)");
  return (
    <>
      {slots.title &&
        createPortal(
          <>
            <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-fg" title={description}>{title}</h1>
            {meta && desktop && <div className="flex shrink-0 items-center gap-1.5">{meta}</div>}
            {description && <p className="hidden truncate text-[13px] text-faint 2xl:block">{description}</p>}
          </>,
          slots.title,
        )}
      {desktop && slots.actions && actions && createPortal(actions, slots.actions)}
      {!desktop && (actions || meta) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
          {meta && <div className="flex items-center gap-1.5">{meta}</div>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1680px] space-y-4 px-4 py-4 sm:px-6 sm:py-5", className)}>{children}</div>;
}
