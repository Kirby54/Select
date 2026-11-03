"use client";

import * as RDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Bot, ListTodo, OctagonX, Play, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { Company, Task } from "@/lib/types";
import { NAV_FLAT } from "./nav";

interface SearchResult {
  tasks: Task[];
  agents: { id: string; name: string; role: string; status: string }[];
}

export function CommandPalette({ company, open, onOpenChange, onToggleStop }: {
  company: Company;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleStop: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(t);
  }, [query]);
  const results = useQuery({
    queryKey: ["c", company.id, "search", debounced],
    queryFn: () => api<SearchResult>(`/companies/${company.id}/search`, { query: { q: debounced } }),
    enabled: open && debounced.length > 0,
  });
  const go = (path: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(path);
  };
  const item = "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-muted data-[selected=true]:bg-hover data-[selected=true]:text-fg";
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <RDialog.Content className="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-lg border border-line bg-card shadow-2xl shadow-black/50" aria-label="Command palette">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">Search tasks and agents, jump to a page or run an action.</RDialog.Description>
          <Command shouldFilter={false} label="Command palette">
            <div className="flex items-center gap-2 border-b border-line px-3.5">
              <Search className="size-4 text-faint" aria-hidden />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Search tasks, agents, pages…" className="h-11 flex-1 bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none" />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{results.isFetching ? "Searching…" : "Nothing found."}</Command.Empty>
              {results.data && results.data.tasks.length > 0 && (
                <Command.Group heading="Tasks" className="text-2xs text-faint [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5">
                  {results.data.tasks.map((t) => (
                    <Command.Item key={t.id} value={`task-${t.id}`} onSelect={() => go(`/c/${company.id}/tasks/${t.id}`)} className={item}>
                      <ListTodo className="size-4" aria-hidden />
                      <span className="font-mono text-xs text-faint">{t.key}</span>
                      <span className="truncate">{t.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {results.data && results.data.agents.length > 0 && (
                <Command.Group heading="Agents" className="text-2xs text-faint [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5">
                  {results.data.agents.map((a) => (
                    <Command.Item key={a.id} value={`agent-${a.id}`} onSelect={() => go(`/c/${company.id}/agents/${a.id}`)} className={item}>
                      <Bot className="size-4" aria-hidden />
                      <span>{a.name}</span>
                      <span className="text-faint">{a.role}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className="text-2xs text-faint [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5">
                {NAV_FLAT.filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase())).map((n) => (
                  <Command.Item key={n.href} value={`nav-${n.href}`} onSelect={() => go(`/c/${company.id}/${n.href}`)} className={item}>
                    <n.icon className="size-4" aria-hidden />
                    <span>{n.label}</span>
                    <span className="ml-auto truncate text-xs text-faint">{n.description}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className="text-2xs text-faint [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5">
                {company.is_demo && (!query || "run demo week".includes(query.toLowerCase())) && (
                  <Command.Item value="action-demo" onSelect={() => go(`/c/${company.id}/overview?demo=run`)} className={item}>
                    <Play className="size-4" aria-hidden /> Run demo week
                  </Command.Item>
                )}
                {(!query || "emergency stop".includes(query.toLowerCase())) && company.role !== "viewer" && (
                  <Command.Item value="action-stop" onSelect={() => { onOpenChange(false); onToggleStop(); }} className={item}>
                    <OctagonX className="size-4 text-danger" aria-hidden /> {company.emergency_stop ? "Lift emergency stop" : "Emergency stop: halt all runs"}
                  </Command.Item>
                )}
              </Command.Group>
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
