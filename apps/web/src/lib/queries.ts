"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "./api";
import type {
  Agent,
  Approval,
  AuditEvent,
  AutonomyView,
  Company,
  Connection,
  ContractView,
  Costs,
  Goal,
  InboxItem,
  Overview,
  Page,
  Project,
  Receipt,
  Task,
  TaskDetail,
  TrustEvent,
  Run,
} from "./types";
import { useToast } from "@/components/ui/feedback";

export function useCompanyId(): string {
  const params = useParams<{ cid: string }>();
  return params.cid;
}

const base = (cid: string) => `/companies/${cid}`;

export const keys = {
  company: (cid: string) => ["company", cid] as const,
  all: (cid: string) => ["c", cid] as const,
};

/** Every company-scoped query starts with ["c", cid] so one invalidation refreshes the screen. */
function cKey(cid: string, ...rest: unknown[]): QueryKey {
  return ["c", cid, ...rest];
}

export const useCompanies = () => useQuery({ queryKey: ["companies"], queryFn: () => api<Company[]>("/companies") });

export const useCompany = (cid: string) =>
  useQuery({ queryKey: cKey(cid, "company"), queryFn: () => api<Company>(base(cid)) });

export const useOverview = (cid: string, days: number) =>
  useQuery({
    queryKey: cKey(cid, "overview", days),
    queryFn: () => api<Overview>(`${base(cid)}/overview`, { query: { days } }),
    refetchInterval: 5000,
  });

export const useInbox = (cid: string) =>
  useQuery({
    queryKey: cKey(cid, "inbox"),
    queryFn: () => api<{ items: InboxItem[]; counts: Record<string, number> }>(`${base(cid)}/inbox`),
    refetchInterval: 5000,
  });

export const useAgents = (cid: string) =>
  useQuery({ queryKey: cKey(cid, "agents"), queryFn: () => api<Agent[]>(`${base(cid)}/agents`) });

export interface AgentDetail extends Agent {
  trust_events: TrustEvent[];
  runs: Run[];
  tasks: Task[];
  costs: { kind: string; amount: string; events: number }[];
  contracts: string[];
}

export const useAgent = (cid: string, id: string) =>
  useQuery({ queryKey: cKey(cid, "agent", id), queryFn: () => api<AgentDetail>(`${base(cid)}/agents/${id}`) });

export interface TaskFilters {
  status?: string[];
  assignee?: string;
  task_type?: string;
  project?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export const useTasks = (cid: string, filters: TaskFilters) =>
  useQuery({
    queryKey: cKey(cid, "tasks", filters),
    queryFn: () => api<Page<Task>>(`${base(cid)}/tasks`, { query: { ...filters } }),
    refetchInterval: 5000,
  });

export const useTask = (cid: string, id: string) =>
  useQuery({
    queryKey: cKey(cid, "task", id),
    queryFn: () => api<TaskDetail>(`${base(cid)}/tasks/${id}`),
    refetchInterval: (query) => (query.state.data?.run_pending ? 1500 : false),
  });

export const useApprovals = (cid: string, status: "pending" | "decided" | "all") =>
  useQuery({
    queryKey: cKey(cid, "approvals", status),
    queryFn: () => api<Page<Approval>>(`${base(cid)}/approvals`, { query: { status, limit: 100 } }),
    refetchInterval: status === "pending" ? 4000 : false,
  });

export const useAutonomy = (cid: string, days: number) =>
  useQuery({
    queryKey: cKey(cid, "autonomy", days),
    queryFn: () => api<AutonomyView>(`${base(cid)}/autonomy`, { query: { days } }),
    refetchInterval: 5000,
  });

export const useContracts = (cid: string) =>
  useQuery({ queryKey: cKey(cid, "contracts"), queryFn: () => api<ContractView[]>(`${base(cid)}/contracts`) });

export const useReceipts = (cid: string, filters: { status?: string; contract?: string; offset?: number }) =>
  useQuery({
    queryKey: cKey(cid, "receipts", filters),
    queryFn: () => api<Page<Receipt>>(`${base(cid)}/receipts`, { query: { ...filters, limit: 50 } }),
  });

export const useCosts = (cid: string, days: number, includeDemo: boolean) =>
  useQuery({
    queryKey: cKey(cid, "costs", days, includeDemo),
    queryFn: () => api<Costs>(`${base(cid)}/costs`, { query: { days, include_demo: includeDemo } }),
  });

export interface ActivityFilters {
  kind?: string;
  actor?: string;
  q?: string;
  offset?: number;
}

export const useActivity = (cid: string, filters: ActivityFilters) =>
  useQuery({
    queryKey: cKey(cid, "activity", filters),
    queryFn: () => api<Page<AuditEvent>>(`${base(cid)}/activity`, { query: { ...filters, limit: 50 } }),
    refetchInterval: 6000,
  });

export const useConnections = (cid: string) =>
  useQuery({ queryKey: cKey(cid, "connections"), queryFn: () => api<Connection[]>(`${base(cid)}/connections`) });

export const useGoals = (cid: string) =>
  useQuery({ queryKey: cKey(cid, "goals"), queryFn: () => api<Goal[]>(`${base(cid)}/goals`) });

export const useProjects = (cid: string) =>
  useQuery({ queryKey: cKey(cid, "projects"), queryFn: () => api<Project[]>(`${base(cid)}/projects`) });

/**
 * A mutation that shows progress, reports errors in a toast, refreshes the company's data
 * and cannot be submitted twice while pending (callers disable their button on isPending).
 */
export function useAction<TVars, TResult = unknown>(
  cid: string,
  fn: (vars: TVars) => Promise<TResult>,
  options: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void; silentError?: boolean } = {},
) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["c", cid] });
      void client.invalidateQueries({ queryKey: ["companies"] });
      if (options.success) {
        toast.show({ tone: "success", title: typeof options.success === "function" ? options.success(result) : options.success });
      }
      options.onSuccess?.(result);
    },
    onError: (error) => {
      // Refresh on failure too, so a conflict (409) shows the other person's version.
      void client.invalidateQueries({ queryKey: ["c", cid] });
      if (!options.silentError) toast.show({ tone: "error", title: errorMessage(error) });
    },
  });
}

/** State remembered per browser (filters, sort, view). Falls back to memory when storage is blocked. */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`select.${key}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore unreadable storage
    }
  }, [key]);
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(`select.${key}`, JSON.stringify(next));
      } catch {
        // storage blocked: keep the value for this session only
      }
    },
    [key],
  );
  return [value, update];
}
