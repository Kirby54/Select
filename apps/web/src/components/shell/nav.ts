import {
  Activity,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  Inbox,
  ListTodo,
  Network,
  Plug,
  Settings,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Work",
    items: [
      { href: "overview", label: "Overview", icon: Gauge, description: "Company health at a glance" },
      { href: "inbox", label: "Inbox", icon: Inbox, description: "What needs you" },
      { href: "tasks", label: "Tasks", icon: ListTodo, description: "All work, list or board" },
      { href: "approvals", label: "Approvals", icon: ClipboardCheck, description: "Actions waiting for a human" },
    ],
  },
  {
    group: "Plan",
    items: [
      { href: "goals", label: "Goals", icon: Target, description: "What the company aims for" },
      { href: "projects", label: "Projects", icon: FolderKanban, description: "Groups of related tasks" },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "organization", label: "Organization", icon: Network, description: "Who reports to whom" },
      { href: "agents", label: "Agents", icon: Bot, description: "Roles, models and permissions" },
    ],
  },
  {
    group: "Trust",
    items: [
      { href: "autonomy", label: "Autonomy", icon: ShieldCheck, description: "Licences earned from verified results" },
      { href: "verification", label: "Verification", icon: BadgeCheck, description: "Contracts and receipts" },
    ],
  },
  {
    group: "Operate",
    items: [
      { href: "costs", label: "Costs", icon: CircleDollarSign, description: "Spend, budgets, cost per result" },
      { href: "activity", label: "Activity", icon: Activity, description: "Audit log of every action" },
      { href: "connections", label: "Connections", icon: Plug, description: "Model providers" },
      { href: "settings", label: "Settings", icon: Settings, description: "Company, policy, catalog" },
    ],
  },
];

export const NAV_FLAT = NAV.flatMap((g) => g.items);
