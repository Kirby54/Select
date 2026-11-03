"use client";

import { Columns3, List, ListTodo, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AgentAvatar, TaskStatusBadge, statusLabel } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { NewTaskDialog } from "@/components/task-form";
import { DataTable, Pagination, type Column } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Badge, Button, Card, IconButton, Input, Select, cx } from "@/components/ui/primitives";
import { relative, taskTypeLabel } from "@/lib/format";
import { useAgents, useCompany, useCompanyId, useContracts, usePersistentState, useTasks } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";

const BOARD: TaskStatus[] = ["todo", "in_progress", "awaiting_approval", "blocked", "done"];
const PRIORITY_TONE = { low: "neutral", medium: "neutral", high: "warning", urgent: "danger" } as const;

export default function TasksPage() {
  const cid = useCompanyId();
  const router = useRouter();
  const company = useCompany(cid);
  const agents = useAgents(cid);
  const contracts = useContracts(cid);
  const [view, setView] = usePersistentState<"list" | "board">(`tasks.view.${cid}`, "list");
  const [filters, setFilters] = usePersistentState<{ status: string; assignee: string; type: string; sort: string }>(
    `tasks.filters.${cid}`,
    { status: "open", assignee: "", type: "", sort: "updated" },
  );
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setOffset(0); }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const statusFilter =
    view === "board" ? undefined : filters.status === "open" ? ["backlog", "todo", "in_progress", "awaiting_approval", "blocked"] : filters.status ? [filters.status] : undefined;
  const limit = view === "board" ? 200 : 50;
  const tasks = useTasks(cid, {
    status: statusFilter,
    assignee: filters.assignee || undefined,
    task_type: filters.type || undefined,
    q: q || undefined,
    sort: filters.sort,
    limit,
    offset: view === "board" ? 0 : offset,
  });
  const canWrite = company.data && company.data.role !== "viewer";

  const columns: Column<Task>[] = [
    {
      key: "title",
      header: "Task",
      cell: (t) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-xs text-faint">{t.key}</span>
          <span className="truncate text-fg">{t.title}</span>
          {t.is_demo && <Badge tone="sampled">Demo</Badge>}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (t) => <TaskStatusBadge status={t.status} /> },
    { key: "type", header: "Type", cell: (t) => <span className="text-muted">{taskTypeLabel(t.task_type)}</span>, hideOnMobile: true },
    {
      key: "assignee",
      header: "Assignee",
      cell: (t) => (t.assignee_name ? <span className="flex items-center gap-2"><AgentAvatar name={t.assignee_name} size="sm" />{t.assignee_name}</span> : <span className="text-faint">Unassigned</span>),
    },
    { key: "priority", header: "Priority", cell: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>, hideOnMobile: true },
    { key: "updated", header: "Updated", cell: (t) => <span className="text-muted">{relative(t.updated_at)}</span>, sortable: true, align: "right" },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every piece of work, who does it and where it stands."
        actions={
          <>
            <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="View">
              <IconButton label="List view" aria-pressed={view === "list"} className={cx(view === "list" && "bg-raised text-fg")} onClick={() => setView("list")}>
                <List className="size-4" aria-hidden />
              </IconButton>
              <IconButton label="Board view" aria-pressed={view === "board"} className={cx(view === "board" && "bg-raised text-fg")} onClick={() => setView("board")}>
                <Columns3 className="size-4" aria-hidden />
              </IconButton>
            </div>
            {canWrite && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setCreating(true)}>New task</Button>}
          </>
        }
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <label htmlFor="task-search" className="sr-only">Search tasks</label>
            <Input id="task-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or T-12" className="h-8 pl-8 text-xs" />
          </div>
          {view === "list" && (
            <>
              <label htmlFor="f-status" className="sr-only">Status</label>
              <Select id="f-status" value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setOffset(0); }} className="h-8 w-40 text-xs">
                <option value="open">Open</option>
                <option value="">All statuses</option>
                {(["todo", "in_progress", "awaiting_approval", "blocked", "done", "cancelled"] as TaskStatus[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </Select>
            </>
          )}
          <label htmlFor="f-assignee" className="sr-only">Assignee</label>
          <Select id="f-assignee" value={filters.assignee} onChange={(e) => { setFilters({ ...filters, assignee: e.target.value }); setOffset(0); }} className="h-8 w-40 text-xs">
            <option value="">All agents</option>
            {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <label htmlFor="f-type" className="sr-only">Task type</label>
          <Select id="f-type" value={filters.type} onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setOffset(0); }} className="h-8 w-44 text-xs">
            <option value="">All types</option>
            {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{taskTypeLabel(c.id)}</option>)}
          </Select>
          {tasks.data && <span className="ml-auto text-xs text-faint tabular">{tasks.data.total} task{tasks.data.total === 1 ? "" : "s"}</span>}
        </div>

        {tasks.isPending ? (
          <Card><LoadingRows /></Card>
        ) : tasks.isError ? (
          <Card><ErrorState error={tasks.error} retry={() => void tasks.refetch()} /></Card>
        ) : view === "list" ? (
          <Card>
            <DataTable
              caption="Tasks"
              rows={tasks.data.items}
              columns={columns}
              rowKey={(t) => t.id}
              rowLabel={(t) => `${t.key} ${t.title}`}
              onRowClick={(t) => router.push(`/c/${cid}/tasks/${t.id}`)}
              sort={{ key: "updated", dir: "desc" }}
              onSort={() => setFilters({ ...filters, sort: filters.sort === "updated" ? "created" : "updated" })}
              empty={
                <EmptyState
                  icon={<ListTodo />}
                  title={q || filters.assignee || filters.type ? "No task matches these filters" : "No task yet"}
                  description={q || filters.assignee || filters.type ? "Clear a filter to see more." : "Create a task and assign it to an agent allowed to do that type of work."}
                  action={canWrite && !q ? <Button size="sm" variant="primary" onClick={() => setCreating(true)}>New task</Button> : undefined}
                />
              }
            />
            <Pagination total={tasks.data.total} limit={limit} offset={offset} onChange={setOffset} />
          </Card>
        ) : (
          <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <div className="grid min-w-[1000px] grid-cols-5 gap-3">
              {BOARD.map((status) => {
                const items = tasks.data.items.filter((t) => t.status === status);
                return (
                  <section key={status} aria-label={statusLabel(status)} className="flex min-h-64 flex-col rounded-lg border border-line bg-surface">
                    <header className="flex items-center justify-between border-b border-line px-3 py-2">
                      <TaskStatusBadge status={status} />
                      <span className="text-xs text-faint tabular">{items.length}</span>
                    </header>
                    <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                      {items.map((t) => (
                        <li key={t.id}>
                          <button type="button" onClick={() => router.push(`/c/${cid}/tasks/${t.id}`)} className="block w-full rounded-md border border-line bg-card p-2.5 text-left hover:border-line-strong">
                            <span className="font-mono text-2xs text-faint">{t.key}</span>
                            <span className="mt-0.5 line-clamp-2 block text-sm text-fg">{t.title}</span>
                            <span className="mt-2 flex items-center justify-between text-2xs text-muted">
                              <span className="truncate">{t.assignee_name ?? "Unassigned"}</span>
                              <span>{taskTypeLabel(t.task_type)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {items.length === 0 && <li className="px-2 py-6 text-center text-xs text-faint">Empty</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
            {tasks.data.total > limit && <p className="mt-2 text-xs text-faint">Showing the {limit} most recent tasks. Use filters or the list view for the rest.</p>}
          </div>
        )}
      </PageBody>
      <NewTaskDialog cid={cid} open={creating} onOpenChange={setCreating} />
    </>
  );
}
