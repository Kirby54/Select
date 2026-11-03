"use client";

import { Activity, Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ActivityTimeline } from "@/components/domain";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Pagination } from "@/components/ui/data";
import { EmptyState, ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Button, Card, Input, Select } from "@/components/ui/primitives";
import { getToken } from "@/lib/api";
import { useActivity, useCompanyId, usePersistentState } from "@/lib/queries";
import type { AuditEvent } from "@/lib/types";

const KINDS = [
  ["", "All events"], ["agent", "Agents & permissions"], ["run", "Runs"], ["verification", "Verifications"],
  ["autonomy", "Promotions & demotions"], ["approval", "Human decisions"], ["task", "Tasks"], ["connection", "Connections"], ["company", "Company"],
] as const;

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFmt.format(d);
}

export default function ActivityPage() {
  const cid = useCompanyId();
  const toast = useToast();
  const [filters, setFilters] = usePersistentState<{ kind: string; actor: string }>(`activity.${cid}`, { kind: "", actor: "" });
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => { setQ(search.trim()); setOffset(0); }, 250);
    return () => window.clearTimeout(t);
  }, [search]);
  const activity = useActivity(cid, { kind: filters.kind || undefined, actor: filters.actor || undefined, q: q || undefined, offset });

  // Group by calendar day, newest first, so the log reads like a journal.
  const days = useMemo(() => {
    const groups: { label: string; events: AuditEvent[] }[] = [];
    for (const e of activity.data?.items ?? []) {
      const label = dayLabel(e.created_at);
      const last = groups.at(-1);
      if (last?.label === label) last.events.push(e);
      else groups.push({ label, events: [e] });
    }
    return groups;
  }, [activity.data]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const url = new URL(`/api/companies/${cid}/activity/export`, window.location.origin);
      if (filters.kind) url.searchParams.set("kind", filters.kind);
      if (filters.actor) url.searchParams.set("actor", filters.actor);
      if (q) url.searchParams.set("q", q);
      const token = getToken();
      const response = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!response.ok) {
        toast.show({ tone: "error", title: "Export failed. Retry in a moment." });
        return;
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "select-activity.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      toast.show({ tone: "success", title: "Activity exported as CSV" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader title="Activity" description="Every action by people, agents and the system; nothing is edited or deleted here"
        actions={<Button size="sm" icon={<Download className="size-3.5" aria-hidden />} loading={exporting} onClick={() => void exportCsv()}>Export CSV</Button>} />
      <PageBody className="max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <label htmlFor="act-search" className="sr-only">Search activity</label>
            <Input id="act-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search summary or person" className="h-7 pl-8" />
          </div>
          <label htmlFor="act-kind" className="sr-only">Event type</label>
          <Select id="act-kind" value={filters.kind} onChange={(e) => { setFilters({ ...filters, kind: e.target.value }); setOffset(0); }} className="h-7 w-48 text-xs">
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <label htmlFor="act-actor" className="sr-only">Actor</label>
          <Select id="act-actor" value={filters.actor} onChange={(e) => { setFilters({ ...filters, actor: e.target.value }); setOffset(0); }} className="h-7 w-32 text-xs">
            <option value="">Everyone</option><option value="user">People</option><option value="agent">Agents</option><option value="system">System</option><option value="demo">Demo</option>
          </Select>
          {activity.data && <span className="ml-auto text-xs text-faint tabular">{activity.data.total} events</span>}
        </div>
        <Card className="overflow-hidden">
          {activity.isPending ? <LoadingRows /> : activity.isError ? <ErrorState error={activity.error} retry={() => void activity.refetch()} /> :
            activity.data.items.length === 0 ? <EmptyState icon={<Activity />} title="No matching event" description="Change the filters or the search." /> : (
              <>
                {days.map((d) => (
                  <section key={d.label} aria-label={d.label}>
                    <h2 className="sticky top-0 z-[1] border-b border-line-soft bg-surface-2/95 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur-sm">{d.label}</h2>
                    <ActivityTimeline events={d.events} />
                  </section>
                ))}
                <Pagination total={activity.data.total} limit={50} offset={offset} onChange={setOffset} />
              </>
            )}
        </Card>
      </PageBody>
    </>
  );
}
