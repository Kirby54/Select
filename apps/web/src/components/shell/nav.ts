import {
  Activity,
  BadgeCheck,
  Bot,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  House,
  Inbox,
  ListTodo,
  Mail,
  Network,
  Plug,
  Settings,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Keyboard shortcut: "G" then this key. */
  key?: string;
}

/** One of the six places in the sidebar. Every other page belongs to one of them. */
export interface NavSection extends NavItem {
  /** Pages that belong here: the sidebar entry stays highlighted on them. */
  pages: string[];
  /** Shown as tabs under the top bar on this place's pages. */
  tabs?: { href: string; label: string }[];
  /** Only shown once the company has a mailbox. */
  needsMailbox?: boolean;
}

export const SECTIONS: NavSection[] = [
  { href: "overview", label: "Home", icon: House, description: "What runs and what waits for you", key: "h", pages: ["overview", "inbox", "activity"] },
  { href: "approvals", label: "Approvals", icon: ClipboardCheck, description: "Results waiting for your decision", key: "a", pages: ["approvals"] },
  {
    href: "tasks",
    label: "Tasks",
    icon: ListTodo,
    description: "All work, list or board",
    key: "t",
    pages: ["tasks", "routines", "projects", "goals"],
    tabs: [
      { href: "tasks", label: "Tasks" },
      { href: "routines", label: "Routines" },
      { href: "projects", label: "Projects" },
      { href: "goals", label: "Goals" },
    ],
  },
  { href: "messages", label: "Messages", icon: Mail, description: "E-mail received and sent", key: "m", pages: ["messages"], needsMailbox: true },
  {
    href: "organization",
    label: "Team",
    icon: Users,
    description: "Agents, who reports to whom, what each may do alone",
    key: "o",
    pages: ["organization", "agents", "autonomy"],
    tabs: [
      { href: "organization", label: "Org chart" },
      { href: "agents", label: "Agents" },
      { href: "autonomy", label: "Autonomy" },
    ],
  },
  { href: "settings", label: "Settings", icon: Settings, description: "Company, people, connections, costs, checks", key: "s", pages: ["settings", "connections", "costs", "verification"] },
];

/** Every page, for search and keyboard shortcuts. */
export const PAGES: NavItem[] = [
  { href: "overview", label: "Home", icon: House, description: "What runs and what waits for you", key: "h" },
  { href: "inbox", label: "Inbox", icon: Inbox, description: "Everything that needs you", key: "i" },
  { href: "approvals", label: "Approvals", icon: ClipboardCheck, description: "Results waiting for your decision", key: "a" },
  { href: "tasks", label: "Tasks", icon: ListTodo, description: "All work, list or board", key: "t" },
  { href: "routines", label: "Routines", icon: CalendarClock, description: "Work created on a schedule", key: "r" },
  { href: "projects", label: "Projects", icon: FolderKanban, description: "Groups of related tasks", key: "p" },
  { href: "goals", label: "Goals", icon: Target, description: "What the company aims for" },
  { href: "messages", label: "Messages", icon: Mail, description: "E-mail received and sent", key: "m" },
  { href: "organization", label: "Org chart", icon: Network, description: "Who reports to whom", key: "o" },
  { href: "agents", label: "Agents", icon: Bot, description: "Roles, models and permissions", key: "e" },
  { href: "autonomy", label: "Autonomy", icon: ShieldCheck, description: "What each agent may do alone, and why", key: "u" },
  { href: "activity", label: "Activity", icon: Activity, description: "Audit log of every action", key: "y" },
  { href: "costs", label: "Costs", icon: CircleDollarSign, description: "Spend, budgets, cost per result", key: "c" },
  { href: "verification", label: "Verification", icon: BadgeCheck, description: "Contracts, checks and receipts", key: "v" },
  { href: "connections", label: "Connections", icon: Plug, description: "AI models and mailboxes", key: "n" },
  { href: "settings", label: "Settings", icon: Settings, description: "Company, people, policy, catalog", key: "s" },
];

/** Kept for older imports: the flat list of pages. */
export const NAV_FLAT = PAGES;

export function sectionOf(page: string | undefined): NavSection | undefined {
  return page ? SECTIONS.find((s) => s.pages.includes(page)) : undefined;
}

export function pageOf(page: string | undefined): NavItem | undefined {
  return page ? PAGES.find((p) => p.href === page) : undefined;
}
