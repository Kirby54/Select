export type Level = "supervised" | "sampled" | "autonomous";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "awaiting_approval" | "blocked" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Role = "owner" | "admin" | "member" | "viewer";

export interface Sourced {
  value: string;
  source_ref: string;
}

export interface CatalogItem {
  ref: string;
  label: string;
  unit: string;
  unit_price: string;
  vat_rate: string;
}

export interface Policy {
  promote_after?: { supervised?: number; sampled?: number };
  sample_rate?: number;
  max_level_by_risk?: Record<string, Level>;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  currency: string;
  monthly_budget: string;
  is_demo: boolean;
  emergency_stop: boolean;
  policy: Policy;
  catalog: CatalogItem[];
  role: Role;
  created_at: string;
}

export interface Trust {
  id: string;
  agent_id: string;
  task_type: string;
  level: Level;
  streak: number;
  successes: number;
  failures: number;
  frozen: boolean;
  updated_at: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  objectives: string;
  instructions: string;
  manager_id: string | null;
  position: number;
  provider: "anthropic" | "openai" | "gemini" | "ollama" | null;
  model: string | null;
  task_types: string[];
  permissions: string[];
  monthly_budget: string;
  status: "active" | "paused" | "archived";
  version: number;
  is_demo_agent: boolean;
  connected: boolean | null;
  trust: Trust[];
  created_at: string;
  updated_at: string;
}

export interface TrustEvent {
  id: string;
  agent_id: string;
  agent_name: string | null;
  task_type: string;
  kind: "promote" | "demote" | "revoke" | "unfreeze" | "reset";
  from_level: Level;
  to_level: Level;
  reason: string;
  receipt_id: string | null;
  actor: string;
  is_demo: boolean;
  created_at: string;
}

export interface Run {
  id: string;
  task_id: string;
  agent_id: string | null;
  attempt: number;
  mode: "live" | "demo" | "submitted";
  status: string;
  output: Record<string, unknown> | null;
  log: { level: string; message: string; data?: unknown }[];
  error: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface CheckResult {
  id: string;
  rule: string;
  description: string;
  blocking: boolean;
  status: "passed" | "failed" | "error";
  message: string;
  evidence: Record<string, unknown>;
}

export interface Receipt {
  id: string;
  run_id: string;
  task_id: string;
  agent_id: string | null;
  contract_id: string;
  contract_version: number;
  contract_sha256: string;
  status: "verified" | "failed" | "blocked";
  body: {
    run_id: string;
    status: string;
    checks: CheckResult[];
    missing: string[];
    errors: string[];
    deliverable_sha256: string;
    verified_at: string;
    verifier: string;
  };
  is_demo: boolean;
  created_at: string;
  task_key?: string | null;
  task_title?: string | null;
  agent_name?: string | null;
}

export interface Approval {
  id: string;
  task_id: string;
  task_key: string | null;
  task_title: string | null;
  task_type: string | null;
  agent_id: string | null;
  agent_name: string | null;
  reason: string;
  action: string | null;
  payload: { action: string | null; preview: string[]; content: Record<string, unknown>; level: Level };
  status: "pending" | "approved" | "rejected" | "changes_requested" | "superseded";
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  is_demo: boolean;
  receipt: Receipt | null;
  created_at: string;
}

export interface Comment {
  id: string;
  author_type: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_type: "user" | "agent" | "system" | "demo";
  actor_id: string;
  actor_name: string;
  kind: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  data: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  task_type: string;
  assignee_id: string | null;
  assignee_name: string | null;
  project_id: string | null;
  goal_id: string | null;
  parent_id: string | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  inputs: { sources?: { id: string; text: string }[] };
  result: Record<string, unknown> | null;
  attempts: number;
  version: number;
  is_demo: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends Task {
  comments: Comment[];
  runs: Run[];
  receipts: Receipt[];
  approvals: Approval[];
  history: AuditEvent[];
  run_pending: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface Counter {
  period_days: number;
  finished: number;
  autonomous: number;
  autonomy_rate: number | null;
  reviewed: number;
  undetected_errors: number;
  undetected_error_rate: number | null;
  undetected_error_measurable: boolean;
  by_agent: Record<string, { finished: number; autonomous: number }>;
  includes_demo: boolean;
}

export interface Overview {
  period_days: number;
  is_demo: boolean;
  emergency_stop: boolean;
  agents: { total: number; active: number; paused: number };
  tasks: { in_progress: number; blocked: number; awaiting_approval: number; todo: number; done: number };
  approvals_pending: number;
  receipts: { verified: number; failed: number; blocked: number };
  autonomy: Counter;
  levels: Record<Level, number>;
  costs: {
    period_live: string;
    period_demo: string;
    month_live: string;
    monthly_budget: string;
    budget_remaining: string | null;
    kind: string;
  };
  series: { day: string; finished: number; autonomous: number; errors: number }[];
  recent: AuditEvent[];
}

export interface Licence extends Trust {
  agent_name: string | null;
  agent_role: string | null;
  cap: Level;
  risk: string | null;
  next_threshold: number | null;
  promotion_blocked: boolean;
}

export interface AutonomyView {
  counter: Counter;
  levels: Record<Level, number>;
  policy: Required<Policy>;
  legal_cap: Level;
  caps: Record<string, Level>;
  licences: Licence[];
  events: TrustEvent[];
}

export interface ContractView {
  id: string;
  version: number;
  title: string;
  description: string;
  risk: "low" | "medium" | "high" | "legal";
  required: string[];
  checks: { id: string; rule: string; description: string; blocking: boolean; params: Record<string, unknown> }[];
  correction: { max_attempts: number };
  approval: { mode: "always" | "by_autonomy"; external_action: string | null };
  sha256: string;
  source: string;
  cap: Level;
  receipts: Partial<Record<"verified" | "failed" | "blocked", number>>;
}

export interface CostRow {
  key: string | null;
  label: string;
  amount: string;
  events: number;
  input_tokens: number;
  output_tokens: number;
}

export interface Costs {
  period_days: number;
  currency: string;
  total: string;
  kind_note: string;
  verified_results: number;
  cost_per_verified_result: string | null;
  by_kind: CostRow[];
  by_agent: CostRow[];
  by_provider: CostRow[];
  by_model: CostRow[];
  by_project: CostRow[];
  by_task: CostRow[];
  daily: { day: string; amount: string }[];
  budget: { monthly: string; spent_live_this_month: string };
  alerts: { level: "warning" | "critical"; message: string }[];
}

export interface Connection {
  provider: string;
  label: string;
  needs_key: boolean;
  docs: string;
  default_base_url: string | null;
  configured: boolean;
  enabled?: boolean;
  has_key?: boolean;
  key_hint?: string | null;
  base_url?: string | null;
  models?: string[];
  prices?: Record<string, { input: string; output: string }>;
  last_test_at?: string | null;
  last_test_ok?: boolean | null;
  last_error?: string | null;
}

export interface InboxItem {
  kind: "approval" | "blocked" | "demotion";
  id: string;
  title: string;
  detail: string;
  task_id?: string;
  agent_id?: string;
  created_at: string;
  is_demo: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: "active" | "achieved" | "dropped";
  target_date: string | null;
  task_count: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "done";
  goal_id: string | null;
  task_count: number;
}

export interface Job {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: { done?: number; total?: number; day?: number; stats?: Record<string, number> };
  error: string | null;
}
