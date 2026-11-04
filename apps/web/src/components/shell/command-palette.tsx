"use client";

import * as RDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Bot, CalendarClock, ClipboardCheck, CornerDownLeft, Keyboard, ListTodo, Mail, OctagonX, PanelLeft, Play, Plus, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import type { Company, Task } from "@/lib/types";
import { Kbd } from "../ui/primitives";
import { NAV_FLAT } from "./nav";

interface SearchResult {
  tasks: Task[];
  agents: { id: string; name: string; role: string; status: string }[];
}

const ITEM =
  "flex h-9 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[13px] text-muted transition-colors duration-75 data-[selected=true]:bg-hover data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-faint data-[selected=true]:[&_svg]:text-muted";
const GROUP = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint";

function matches(query: string, ...words: string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || words.some((w) => w.toLowerCase().includes(q));
}

export function CommandPalette({ company, open, onOpenChange, onToggleStop, onToggleSidebar, onShowShortcuts }: {
  company: Company;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleStop: () => void;
  onToggleSidebar: () => void;
  onShowShortcuts: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 160);
    return () => window.clearTimeout(t);
  }, [query]);
  const results = useQuery({
    queryKey: ["c", company.id, "search", debounced],
    queryFn: () => api<SearchResult>(`/companies/${company.id}/search`, { query: { q: debounced } }),
    enabled: open && debounced.length > 0,
  });
  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  const go = (path: string) => {
    close();
    router.push(path);
  };
  const run = (fn: () => void) => {
    close();
    fn();
  };
  const canWrite = company.role !== "viewer";
  const actions: { id: string; label: string; icon: ReactNode; words: string[]; onSelect: () => void; hint?: string; show: boolean }[] = [
    { id: "new-task", label: "New task", icon: <Plus aria-hidden />, words: ["new task", "create task"], hint: "C", show: canWrite, onSelect: () => go(`/c/${company.id}/tasks?new=1`) },
    { id: "new-agent", label: "New agent", icon: <UserPlus aria-hidden />, words: ["new agent", "hire", "add agent"], show: canWrite, onSelect: () => go(`/c/${company.id}/agents?new=1`) },
    { id: "approvals", label: "Review pending approvals", icon: <ClipboardCheck aria-hidden />, words: ["approve", "review", "approvals"], show: true, onSelect: () => go(`/c/${company.id}/approvals`) },
    { id: "new-routine", label: "New routine", icon: <CalendarClock aria-hidden />, words: ["new routine", "schedule", "recurring"], show: canWrite && !company.is_demo, onSelect: () => go(`/c/${company.id}/routines?new=1`) },
    { id: "mailbox", label: "Connect a mailbox", icon: <Mail aria-hidden />, words: ["mailbox", "email", "imap", "smtp"], show: canWrite && !company.is_demo, onSelect: () => go(`/c/${company.id}/connections?mailbox=new`) },
    { id: "invite", label: "Invite someone", icon: <UserPlus aria-hidden />, words: ["invite", "member", "people", "team"], show: !company.is_demo && (company.role === "owner" || company.role === "admin"), onSelect: () => go(`/c/${company.id}/settings?section=people`) },
    { id: "demo", label: "Run demo week", icon: <Play aria-hidden />, words: ["run demo week", "demo"], show: company.is_demo && canWrite, onSelect: () => go(`/c/${company.id}/overview?demo=run`) },
    { id: "sidebar", label: "Collapse or expand the sidebar", icon: <PanelLeft aria-hidden />, words: ["sidebar", "collapse"], hint: "Ctrl B", show: true, onSelect: () => run(onToggleSidebar) },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard aria-hidden />, words: ["keyboard", "shortcuts", "help"], hint: "?", show: true, onSelect: () => run(onShowShortcuts) },
    {
      id: "stop",
      label: company.emergency_stop ? "Lift emergency stop" : "Emergency stop: halt all runs",
      icon: <OctagonX aria-hidden className="text-danger!" />,
      words: ["emergency stop", "halt", "stop"],
      show: canWrite,
      onSelect: () => run(onToggleStop),
    },
  ];
  const visibleActions = actions.filter((a) => a.show && matches(query, a.label, ...a.words));
  const pages = NAV_FLAT.filter((n) => matches(query, n.label, n.description));

  return (
    <RDialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <RDialog.Content
          className="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-[620px] overflow-hidden rounded-2xl border border-line bg-surface/92 shadow-[var(--shadow-dialog)] backdrop-blur-xl backdrop-saturate-150 data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
          aria-label="Command palette"
        >
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">Search tasks and agents, jump to a page or run an action.</RDialog.Description>
          <Command shouldFilter={false} label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-line-soft px-4">
              <Search className="size-4 shrink-0 text-faint" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search tasks, agents, pages…"
                className="h-12 flex-1 bg-transparent text-[15px] text-fg placeholder:text-faint focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(56vh,460px)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">{results.isFetching ? "Searching…" : "Nothing found."}</Command.Empty>
              {results.data && results.data.tasks.length > 0 && (
                <Command.Group heading="Tasks" className={GROUP}>
                  {results.data.tasks.map((t) => (
                    <Command.Item key={t.id} value={`task-${t.id}`} onSelect={() => go(`/c/${company.id}/tasks/${t.id}`)} className={ITEM}>
                      <ListTodo aria-hidden />
                      <span className="w-12 shrink-0 font-mono text-xs text-faint">{t.key}</span>
                      <span className="truncate text-fg">{t.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {results.data && results.data.agents.length > 0 && (
                <Command.Group heading="Agents" className={GROUP}>
                  {results.data.agents.map((a) => (
                    <Command.Item key={a.id} value={`agent-${a.id}`} onSelect={() => go(`/c/${company.id}/agents/${a.id}`)} className={ITEM}>
                      <Bot aria-hidden />
                      <span className="text-fg">{a.name}</span>
                      <span className="truncate text-faint">{a.role}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading="Go to" className={GROUP}>
                  {pages.map((n) => (
                    <Command.Item key={n.href} value={`nav-${n.href}`} onSelect={() => go(`/c/${company.id}/${n.href}`)} className={ITEM}>
                      <n.icon aria-hidden />
                      <span className="text-fg">{n.label}</span>
                      <span className="ml-auto hidden truncate text-xs text-faint sm:inline">{n.description}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {visibleActions.length > 0 && (
                <Command.Group heading="Actions" className={GROUP}>
                  {visibleActions.map((a) => (
                    <Command.Item key={a.id} value={`action-${a.id}`} onSelect={a.onSelect} className={ITEM}>
                      {a.icon}
                      <span className="text-fg">{a.label}</span>
                      {a.hint && <span className="ml-auto"><Kbd>{a.hint}</Kbd></span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="hidden items-center gap-4 border-t border-line-soft px-4 py-2 text-xs text-faint sm:flex">
              <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
              <span className="inline-flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-3" aria-hidden /></Kbd> open</span>
              <span className="ml-auto">Select</span>
            </div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
