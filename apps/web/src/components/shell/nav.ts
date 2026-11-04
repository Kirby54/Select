import {
  Activity,
  BadgeCheck,
  Bot,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  Inbox,
  ListTodo,
  Mail,
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
  /** Keyboard shortcut shown in the palette: "G" then this key. */
  key?: string;
}

/**
 * Sections follow how a manager thinks: what needs me, the work, the team, the trust it earned,
 * and what it costs. Connections and Settings sit at the foot of the sidebar, like a native app.
 */
export const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { href: "overview", label: "Overview", icon: Gauge, description: "The company at a glance", key: "o" },
      { href: "inbox", label: "Inbox", icon: Inbox, description: "What needs you", key: "i" },
    ],
  },
  {
    group: "Work",
    items: [
      { href: "tasks", label: "Tasks", icon: ListTodo, description: "All work, list or board", key: "t" },
      { href: "approvals", label: "Approvals", icon: ClipboardCheck, description: "Actions waiting for a human", key: "a" },
      { href: "messages", label: "Messages", icon: Mail, description: "E-mail received and sent", key: "m" },
      { href: "routines", label: "Routines", icon: CalendarClock, description: "Work created on a schedule", key: "r" },
      { href: "projects", label: "Projects", icon: FolderKanban, description: "Groups of related tasks", key: "p" },
      { href: "goals", label: "Goals", icon: Target, description: "What the company aims for" },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "organization", label: "Organization", icon: Network, description: "Who reports to whom" },
      { href: "agents", label: "Agents", icon: Bot, description: "Roles, models and permissions", key: "e" },
    ],
  },
  {
    group: "Trust",
    items: [
      { href: "autonomy", label: "Autonomy", icon: ShieldCheck, description: "Licences earned from verified results", key: "u" },
      { href: "verification", label: "Verification", icon: BadgeCheck, description: "Contracts and receipts", key: "v" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "costs", label: "Costs", icon: CircleDollarSign, description: "Spend, budgets, cost per result", key: "c" },
      { href: "activity", label: "Activity", icon: Activity, description: "Audit log of every action" },
    ],
  },
];

export const NAV_FOOT: NavItem[] = [
  { href: "connections", label: "Connections", icon: Plug, description: "Model providers and mailboxes" },
  { href: "settings", label: "Settings", icon: Settings, description: "Company, people, policy, catalog", key: "s" },
];

export const NAV_FLAT: NavItem[] = [...NAV.flatMap((g) => g.items), ...NAV_FOOT];
