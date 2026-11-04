"use client";

import { ArrowUpRight, CalendarClock, Columns3, List, ListTodo, Mail, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentAvatar, PriorityIcon, ProjectDot, STATUS_ORDER, StatusIcon, TaskStatusBadge, VerificationReceipt, statusLabel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { NewTaskDialog } from "@/components/task-form";
import { Pagination } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Button, Card, DemoTag, Input, Kbd, Segmented, Select, cx } from "@/components/ui/primitives";
import { formatDate, relative, taskTypeLabel } from "@/lib/format";
import { useAgents, useCompany, useCompanyId, useContracts, usePersistentState, useProjects, useTask, useTasks } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";

const BOARD: TaskStatus[] = ["todo", "in_progress", "awaiting_approval", "blocked", "done"];
const PRESETS: { value: string; label: string; statuses?: TaskStatus[] }[] = [
  { value: "open", label: "Open", statuses: ["backlog", "todo", "in_progress", "awaiting_approval", "blocked"] },
  { value: "awaiting_approval", label: "Awaiting", statuses: ["awaiting_approval"] },
  { value: "blocked", label: "Blocked", statuses: ["blocked"] },
  { value: "done", label: "Done", statuses: ["done"] },
  { value: "", label: "All" },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role='dialog']") !== null);
}

function TaskRow({ task, tabbable, selected, onOpen, onFocus, rowRef }: { task: Task; tabbable: boolean; selected: boolean; onOpen: () => void; onFocus: () => void; rowRef: (el: HTMLButtonElement | null) => void }) {
  return (
    <button
      ref={rowRef}
      type="button"
      data-row
      tabIndex={tabbable ? 0 : -1}
      onClick={onOpen}
      onFocus={onFocus}
      aria-current={selected ? "true" : undefined}
      aria-label={`${task.key} ${task.title}, ${statusLabel(task.status)}, ${task.assignee_name ?? "unassigned"}`}
      className={cx(
        "group flex h-9 w-full items-center gap-3 px-4 text-left text-[13px] transition-colors duration-[100ms] focus-visible:outline-none",
        selected ? "bg-selected shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-hover",
      )}
    >
      <PriorityIcon priority={task.priority} />
      <span className="w-12 shrink-0 font-mono text-xs text-faint">{task.key}</span>
      <StatusIcon status={task.status} />
      {task.project_id && <ProjectDot id={task.project_id} className="size-2" />}
      <span className="min-w-0 flex-1 truncate text-fg">{task.title}</span>
      {task.origin === "mail" || task.origin === "routing" ? <Mail className="size-3.5 shrink-0 text-faint" aria-label="From an e-mail" /> : null}
      {task.origin === "routine" && <CalendarClock className="size-3.5 shrink-0 text-faint" aria-label="Created by a routine" />}
      {task.is_demo && <DemoTag className="hidden sm:inline-flex" />}
      <span className="hidden w-28 shrink-0 truncate text-xs text-muted lg:block">{taskTypeLabel(task.task_type)}</span>
      <span className="hidden w-32 shrink-0 items-center gap-2 truncate text-xs text-muted md:flex">
        {task.assignee_name ? <><AgentAvatar name={task.assignee_name} size="sm" /><span className="truncate">{task.assignee_name}</span></> : <span className="text-faint">Unassigned</span>}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-faint tabular">{relative(task.updated_at)}</span>
    </button>
  );
}

function TaskInspector({ cid, id }: { cid: string; id: string }) {
  const task = useTask(cid, id);
  if (task.isPending) return <LoadingRows rows={6} />;
  if (task.isError) return <ErrorState error={task.error} compact />;
  const t = task.data;
  const receipt = t.receipts.at(-1);
  const pending = t.approvals.find((a) => a.status === "pending");
  return (
    <div className="space-y-5 p-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div><dt className="text-faint">Status</dt><dd className="mt-1"><TaskStatusBadge status={t.status} plain /></dd></div>
        <div><dt className="text-faint">Assignee</dt><dd className="mt-1 flex items-center gap-2 text-[13px] text-fg">{t.assignee_name ? <><AgentAvatar name={t.assignee_name} size="sm" />{t.assignee_name}</> : <span className="text-muted">Unassigned</span>}</dd></div>
        <div><dt className="text-faint">Type</dt><dd className="mt-1 text-[13px] text-fg">{taskTypeLabel(t.task_type)}</dd></div>
        <div><dt className="text-faint">Priority</dt><dd className="mt-1 flex items-center gap-2 text-[13px] text-fg capitalize"><PriorityIcon priority={t.priority} />{t.priority}</dd></div>
        <div><dt className="text-faint">Created</dt><dd className="mt-1 text-[13px] text-muted">{formatDate(t.created_at)}</dd></div>
        <div><dt className="text-faint">Attempts</dt><dd className="mt-1 text-[13px] text-muted tabular">{t.attempts}</dd></div>
      </dl>
      {pending && (
        <Link href={`/c/${cid}/approvals`} className="flex items-center justify-between gap-3 rounded-xl border border-supervised/30 bg-supervised/8 px-3.5 py-2.5 text-[13px] text-supervised hover:bg-supervised/12">
          Waiting for your approval <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      )}
      {t.description && <p className="text-[13px] whitespace-pre-wrap text-muted">{t.description}</p>}
      {receipt ? (
        <section>
          <h3 className="mb-2 text-xs font-medium text-muted">Latest verification</h3>
          <VerificationReceipt receipt={receipt} />
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-[13px] text-faint">No result verified yet.</p>
      )}
    </div>
  );
}

function TasksInner() {
  const cid = useCompanyId();
  const router = useRouter();
  const params = useSearchParams();
  const company = useCompany(cid);
  const agents = useAgents(cid);
  const contracts = useContracts(cid);
  const projects = useProjects(cid);
  const projectFilter = params.get("project") ?? "";
  const project = projects.data?.find((p) => p.id === projectFilter);
  const [view, setView] = usePersistentState<"list" | "board">(`tasks.view.${cid}`, "list");
  const [filters, setFilters] = usePersistentState<{ status: string; assignee: string; type: string; sort: string }>(
    `tasks.filters.${cid}`,
    { status: "open", assignee: "", type: "", sort: "updated" },
  );
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [inspected, setInspected] = useState<string | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const canWrite = !!company.data && company.data.role !== "viewer";

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setOffset(0); }, 220);
    return () => window.clearTimeout(t);
  }, [search]);
  // "?new=1" (from the command palette) opens the form; closing it clears the parameter.
  const wantsNew = params.get("new") === "1";
  const createOpen = creating || (wantsNew && canWrite);
  const setCreateOpen = (open: boolean) => {
    setCreating(open);
    if (!open && wantsNew) router.replace(`/c/${cid}/tasks`);
  };

  const preset = PRESETS.find((p) => p.value === filters.status);
  const statusFilter = view === "board" ? undefined : preset?.statuses ?? (filters.status && !preset ? [filters.status] : undefined);
  const limit = view === "board" ? 200 : 50;
  const tasks = useTasks(cid, {
    status: statusFilter,
    assignee: filters.assignee || undefined,
    task_type: filters.type || undefined,
    project: projectFilter || undefined,
    q: q || undefined,
    sort: filters.sort,
    limit,
    offset: view === "board" ? 0 : offset,
  });

  // Linear-style grouping by status, in the order that needs attention first.
  const groups = useMemo(() => {
    const items = tasks.data?.items ?? [];
    const present = STATUS_ORDER.map((status) => ({ status, items: items.filter((t) => t.status === status) })).filter((g) => g.items.length > 0);
    return present.map((g, i) => ({ ...g, start: present.slice(0, i).reduce((n, p) => n + p.items.length, 0) }));
  }, [tasks.data]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = Math.min(cursor, Math.max(0, flat.length - 1));

  const focusRow = useCallback((index: number) => {
    setCursor(index);
    rows.current[index]?.focus();
    rows.current[index]?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "c" && canWrite) { e.preventDefault(); setCreating(true); return; }
      if (view !== "list" || flat.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); focusRow(Math.min(flat.length - 1, current + 1)); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); focusRow(Math.max(0, current - 1)); }
      if (e.key === "o" && flat[current]) { e.preventDefault(); router.push(`/c/${cid}/tasks/${flat[current]!.id}`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, flat, current, canWrite, focusRow, router, cid]);

  const filtered = !!(q || filters.assignee || filters.type);
  const inspectedTask = tasks.data?.items.find((t) => t.id === inspected);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every piece of work, who does it and where it stands"
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: <><List className="size-3.5" aria-hidden /><span className="sr-only sm:not-sr-only">List</span></>, title: "List view" },
                { value: "board", label: <><Columns3 className="size-3.5" aria-hidden /><span className="sr-only sm:not-sr-only">Board</span></>, title: "Board view" },
              ]}
            />
            {canWrite && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setCreating(true)}>New task</Button>}
          </>
        }
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <label htmlFor="task-search" className="sr-only">Search tasks</label>
            <Input ref={searchRef} id="task-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or T-12" className="h-7 pr-8 pl-8" />
            <Kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
          </div>
          {view === "list" && (
            <Segmented
              label="Status"
              value={preset ? filters.status : ""}
              onChange={(v) => { setFilters({ ...filters, status: v }); setOffset(0); setCursor(0); }}
              options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            />
          )}
          {projectFilter && (
            <button
              type="button"
              onClick={() => router.replace(`/c/${cid}/tasks`)}
              className="inline-flex h-7 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-fg transition-colors hover:border-line-strong"
              aria-label={`Project ${project?.name ?? ""}: show all projects`}
            >
              <ProjectDot id={projectFilter} />
              {project?.name ?? "Project"}
              <X className="size-3 text-faint" aria-hidden />
            </button>
          )}
          <label htmlFor="f-assignee" className="sr-only">Assignee</label>
          <Select id="f-assignee" value={filters.assignee} onChange={(e) => { setFilters({ ...filters, assignee: e.target.value }); setOffset(0); }} className="h-7 w-36 text-xs">
            <option value="">All agents</option>
            {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <label htmlFor="f-type" className="sr-only">Task type</label>
          <Select id="f-type" value={filters.type} onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setOffset(0); }} className="h-7 w-36 text-xs">
            <option value="">All types</option>
            {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{taskTypeLabel(c.id)}</option>)}
          </Select>
          <label htmlFor="f-sort" className="sr-only">Sort</label>
          <Select id="f-sort" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} className="h-7 w-36 text-xs">
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
          </Select>
          {tasks.data && <span className="ml-auto text-xs text-faint tabular">{tasks.data.total} task{tasks.data.total === 1 ? "" : "s"}</span>}
        </div>

        {tasks.isPending ? (
          <Card><LoadingRows /></Card>
        ) : tasks.isError ? (
          <Card><ErrorState error={tasks.error} retry={() => void tasks.refetch()} /></Card>
        ) : view === "list" ? (
          <Card className="overflow-hidden">
            {flat.length === 0 ? (
              <EmptyState
                icon={<ListTodo />}
                title={filtered ? "No task matches these filters" : "No task here"}
                description={filtered ? "Clear a filter to see more." : "Create a task and assign it to an agent allowed to do that type of work."}
                action={canWrite && !filtered ? <Button size="sm" variant="primary" onClick={() => setCreating(true)}>New task</Button> : undefined}
              />
            ) : (
              <div
                role="list"
                aria-label="Tasks"
                onFocus={() => setListFocused(true)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setListFocused(false); }}
              >
                {groups.map((g) => (
                  <section key={g.status} aria-label={statusLabel(g.status)}>
                    <h2 className="sticky top-0 z-[1] flex h-8 items-center gap-2 border-y border-line-soft bg-surface-2/95 px-4 text-xs font-medium text-muted backdrop-blur-sm first:border-t-0">
                      <StatusIcon status={g.status} />
                      {statusLabel(g.status)}
                      <span className="text-faint tabular">{g.items.length}</span>
                    </h2>
                    {g.items.map((t, j) => {
                      const i = g.start + j;
                      return (
                        <div role="listitem" key={t.id} className="border-b border-line-soft last:border-0">
                          <TaskRow
                            task={t}
                            tabbable={i === current}
                            selected={i === current && (listFocused || inspected === t.id)}
                            rowRef={(el) => { rows.current[i] = el; }}
                            onFocus={() => setCursor(i)}
                            onOpen={() => { setCursor(i); setInspected(t.id); }}
                          />
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
            <Pagination total={tasks.data.total} limit={limit} offset={offset} onChange={(o) => { setOffset(o); setCursor(0); }} />
            <p className="hidden items-center gap-3 border-t border-line-soft px-4 py-2 text-xs text-faint lg:flex">
              <span className="inline-flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
              <span className="inline-flex items-center gap-1"><Kbd>Enter</Kbd> preview</span>
              <span className="inline-flex items-center gap-1"><Kbd>O</Kbd> open</span>
              <span className="inline-flex items-center gap-1"><Kbd>C</Kbd> new task</span>
            </p>
          </Card>
        ) : (
          <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            <div className="grid min-w-[1060px] grid-cols-5 gap-3">
              {BOARD.map((status) => {
                const items = tasks.data.items.filter((t) => t.status === status);
                return (
                  <section key={status} aria-label={statusLabel(status)} className="flex min-h-72 flex-col rounded-xl bg-surface/60 ring-1 ring-line-soft">
                    <header className="flex h-10 items-center gap-2 px-3 text-xs font-medium text-muted">
                      <StatusIcon status={status} />
                      {statusLabel(status)}
                      <span className="ml-auto text-faint tabular">{items.length}</span>
                    </header>
                    <ul className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                      {items.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => setInspected(t.id)}
                            className="block w-full rounded-lg border border-line bg-surface p-3 text-left shadow-[var(--shadow-sheen)] transition-colors duration-[120ms] hover:border-line-strong"
                          >
                            <span className="flex items-center gap-2">
                              <PriorityIcon priority={t.priority} />
                              <span className="font-mono text-2xs text-faint">{t.key}</span>
                              {t.is_demo && <DemoTag className="ml-auto" />}
                            </span>
                            <span className="mt-1.5 line-clamp-2 block text-[13px] text-fg">{t.title}</span>
                            <span className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted">
                              <span className="flex min-w-0 items-center gap-1.5">
                                {t.assignee_name && <AgentAvatar name={t.assignee_name} size="sm" />}
                                <span className="truncate">{t.assignee_name ?? "Unassigned"}</span>
                              </span>
                              <span className="shrink-0 text-faint">{taskTypeLabel(t.task_type)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {items.length === 0 && <li className="rounded-lg border border-dashed border-line-soft px-2 py-6 text-center text-xs text-faint">Empty</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
            {tasks.data.total > limit && <p className="mt-2 text-xs text-faint">Showing the {limit} most recent tasks. Use filters or the list view for the rest.</p>}
          </div>
        )}
      </PageBody>
      <DetailPanel
        open={!!inspected}
        onOpenChange={(o) => { if (!o) { setInspected(null); window.setTimeout(() => rows.current[current]?.focus(), 0); } }}
        title={inspectedTask ? `${inspectedTask.key} · ${inspectedTask.title}` : "Task"}
        subtitle={inspectedTask ? `${taskTypeLabel(inspectedTask.task_type)} · updated ${relative(inspectedTask.updated_at)}` : undefined}
        actions={inspected && <Link href={`/c/${cid}/tasks/${inspected}`} className="mr-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-hover hover:text-accent-strong">Open <ArrowUpRight className="size-3" aria-hidden /></Link>}
      >
        {inspected && <TaskInspector cid={cid} id={inspected} />}
      </DetailPanel>
      <NewTaskDialog cid={cid} open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <TasksInner />
    </Suspense>
  );
}
