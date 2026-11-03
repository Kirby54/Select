"use client";

/** Dialog, ConfirmDialog, DetailPanel (side sheet), Dropdown, Tooltip and Popover on Radix primitives. */
import * as RDialog from "@radix-ui/react-dialog";
import * as RDropdown from "@radix-ui/react-dropdown-menu";
import * as RPopover from "@radix-ui/react-popover";
import * as RTooltip from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button, IconButton, cx } from "./primitives";

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/60" />
        <RDialog.Content
          className={cx(
            "fixed inset-x-3 top-[8vh] z-50 mx-auto max-h-[84vh] animate-fade-in overflow-y-auto rounded-lg border border-line bg-card shadow-2xl shadow-black/40",
            wide ? "max-w-2xl" : "max-w-md",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <RDialog.Title className="text-sm font-semibold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-xs text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <IconButton label="Close">
                <X className="size-4" aria-hidden />
              </IconButton>
            </RDialog.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Confirmation for dangerous or irreversible actions. */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, danger = true, children }: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | void;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              variant={danger ? "danger" : "primary"}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children ?? <p className="text-sm text-muted">This action is recorded in the activity log.</p>}
      </Dialog>
    </>
  );
}

/** Right-hand contextual panel for details; full screen on phones. */
export function DetailPanel({ open, onOpenChange, title, subtitle, children, actions }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:bg-black/20" />
        <RDialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full animate-slide-in flex-col border-l border-line bg-surface shadow-2xl shadow-black/40 sm:max-w-xl">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RDialog.Title className="truncate text-sm font-semibold">{title}</RDialog.Title>
              <RDialog.Description className={subtitle ? "mt-0.5 text-xs text-muted" : "sr-only"}>{subtitle ?? "Details"}</RDialog.Description>
            </div>
            <div className="flex items-center gap-1.5">
              {actions}
              <RDialog.Close asChild>
                <IconButton label="Close panel">
                  <X className="size-4" aria-hidden />
                </IconButton>
              </RDialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Dropdown({ trigger, items, align = "end" }: {
  trigger: ReactNode;
  items: ({ label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean } | "separator")[];
  align?: "start" | "end";
}) {
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>{trigger}</RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content align={align} sideOffset={4} className="z-50 min-w-44 animate-fade-in rounded-md border border-line bg-raised p-1 shadow-xl shadow-black/40">
          {items.map((item, i) =>
            item === "separator" ? (
              <RDropdown.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <RDropdown.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cx(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-hover",
                  item.danger ? "text-danger" : "text-fg",
                )}
              >
                {item.icon}
                {item.label}
              </RDropdown.Item>
            ),
          )}
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content sideOffset={6} className="z-[70] max-w-xs rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs text-fg shadow-lg shadow-black/40">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Popover({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align={align} sideOffset={6} className="z-50 w-80 max-w-[calc(100vw-24px)] animate-fade-in rounded-lg border border-line bg-raised shadow-xl shadow-black/40">
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
