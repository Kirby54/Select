"use client";

/**
 * DataTable (dense 36 px rows, sortable, keyboard rows, cards under 768 px), Pagination and Tabs.
 * Phones get a card layout instead of a table, so the page never scrolls sideways.
 */
import * as RTabs from "@radix-ui/react-tabs";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { useIsDesktop } from "@/lib/hooks";
import { Button, cx } from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hidden in the phone card layout. */
  hideOnMobile?: boolean;
  sortable?: boolean;
  align?: "right";
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, sort, onSort, empty, caption, rowLabel, selectedKey, comfortable }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  empty?: ReactNode;
  caption: string;
  rowLabel?: (row: T) => string;
  selectedKey?: string | null;
  /** 48 px rows for two-line cells (name + role); default rows are 36 px. */
  comfortable?: boolean;
}) {
  // Mount one layout at a time: a table from 768 px, cards below.
  const desktop = useIsDesktop();
  if (rows.length === 0 && empty) return <>{empty}</>;
  return desktop ? (
      <div className="relative overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cx(
                    "h-8 border-b border-line-soft px-3 text-xs font-medium whitespace-nowrap text-faint first:pl-4 last:pr-4",
                    col.align === "right" && "text-right",
                    col.className,
                  )}
                  aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {col.sortable && onSort ? (
                    <button type="button" onClick={() => onSort(col.key)} className="inline-flex items-center gap-1 rounded-sm hover:text-fg">
                      {col.header}
                      {sort?.key === col.key && (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const selected = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                  aria-selected={onRowClick ? selected : undefined}
                  className={cx(
                    "group transition-colors duration-[120ms] [&>td]:border-b [&>td]:border-line-soft last:[&>td]:border-0",
                    onRowClick && "cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:[&>td:first-child]:shadow-[inset_2px_0_0_var(--color-accent)]",
                    selected && "bg-selected hover:bg-selected [&>td:first-child]:shadow-[inset_2px_0_0_var(--color-accent)]",
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cx(comfortable ? "h-12" : "h-9", "px-3 align-middle whitespace-nowrap first:pl-4 last:pr-4", col.align === "right" && "text-right tabular", col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  ) : (
      <ul className="divide-y divide-line-soft" aria-label={caption}>
        {rows.map((row) => {
          const visible = columns.filter((c) => !c.hideOnMobile);
          const [first, ...rest] = visible;
          const content = (
            <>
              {first && <div className="text-sm text-fg">{first.cell(row)}</div>}
              {rest.length > 0 && (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {rest.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-faint">{col.header}</dt>
                      <dd className="truncate text-muted">{col.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={rowKey(row)}>
              {onRowClick ? (
                <button type="button" onClick={() => onRowClick(row)} className="block w-full px-4 py-3 text-left active:bg-press">
                  {content}
                </button>
              ) : (
                <div className="px-4 py-3">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line-soft px-4 py-2 text-xs text-muted">
      <span className="tabular">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))} icon={<ChevronLeft className="size-3.5" aria-hidden />}>
          Previous
        </Button>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Next <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

export function Tabs({ value, onValueChange, tabs, children, label, className }: {
  value: string;
  onValueChange: (value: string) => void;
  tabs: { value: string; label: string; count?: number }[];
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange}>
      <RTabs.List aria-label={label} className={cx("scrollbar-none flex gap-4 overflow-x-auto border-b border-line-soft px-4", className)}>
        {tabs.map((tab) => (
          <RTabs.Trigger
            key={tab.value}
            value={tab.value}
            className="relative -mb-px flex h-10 items-center gap-1.5 border-b-2 border-transparent text-[13px] whitespace-nowrap text-muted transition-colors duration-[120ms] hover:text-fg data-[state=active]:border-fg data-[state=active]:text-fg"
          >
            {tab.label}
            {tab.count !== undefined && <span className="rounded-[5px] bg-surface-2 px-1.5 text-2xs leading-4 tabular text-muted">{tab.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export const TabPanel = RTabs.Content;
