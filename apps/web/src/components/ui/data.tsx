"use client";

/** DataTable (dense, sortable, collapses to cards on phones), Tabs and Pagination. */
import * as RTabs from "@radix-ui/react-tabs";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

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

export function DataTable<T>({ rows, columns, rowKey, onRowClick, sort, onSort, empty, caption, rowLabel }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  empty?: ReactNode;
  caption: string;
  rowLabel?: (row: T) => string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <>
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              {columns.map((col) => (
                <th key={col.key} scope="col" className={cx("h-9 px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4", col.align === "right" && "text-right", col.className)}
                  aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {col.sortable && onSort ? (
                    <button type="button" onClick={() => onSort(col.key)} className="inline-flex items-center gap-1 hover:text-fg">
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
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                className={cx("border-b border-line/70 last:border-0", onRowClick && "cursor-pointer hover:bg-raised/60 focus-visible:bg-raised/60")}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx("h-10 px-3 align-middle first:pl-4 last:pr-4", col.align === "right" && "text-right tabular", col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const visible = columns.filter((c) => !c.hideOnMobile);
          const [first, ...rest] = visible;
          const content = (
            <>
              {first && <div className="text-sm text-fg">{first.cell(row)}</div>}
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {rest.map((col) => (
                  <div key={col.key} className="min-w-0">
                    <dt className="text-faint">{col.header}</dt>
                    <dd className="truncate text-muted">{col.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(row)}>
              {onRowClick ? (
                <button type="button" onClick={() => onRowClick(row)} className="block w-full px-4 py-3 text-left hover:bg-raised/60">
                  {content}
                </button>
              ) : (
                <div className="px-4 py-3">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
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

export function Tabs({ value, onValueChange, tabs, children, label }: {
  value: string;
  onValueChange: (value: string) => void;
  tabs: { value: string; label: string; count?: number }[];
  children: ReactNode;
  label: string;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange}>
      <RTabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line px-4">
        {tabs.map((tab) => (
          <RTabs.Trigger
            key={tab.value}
            value={tab.value}
            className="-mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2 text-sm whitespace-nowrap text-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg"
          >
            {tab.label}
            {tab.count !== undefined && <span className="rounded-sm bg-raised px-1 text-2xs tabular text-muted">{tab.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export const TabPanel = RTabs.Content;
