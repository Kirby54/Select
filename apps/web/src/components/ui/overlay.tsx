"use client";

/**
 * Overlays on Radix primitives (focus trap, Escape, ARIA): Dialog, ConfirmDialog, DetailPanel (inspector sheet),
 * Dropdown, Tooltip and Popover. Enter with a short pop or a spring slide; leave faster than they arrive.
 */
import * as RDialog from "@radix-ui/react-dialog";
import * as RDropdown from "@radix-ui/react-dropdown-menu";
import * as RPopover from "@radix-ui/react-popover";
import * as RTooltip from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Button, IconButton, Input, cx } from "./primitives";

const SCRIM = "fixed inset-0 bg-scrim backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out";

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
        <RDialog.Overlay className={cx(SCRIM, "z-50")} />
        <RDialog.Content
          className={cx(
            "fixed z-50 flex max-h-[88dvh] flex-col overflow-hidden border border-line bg-surface shadow-[var(--shadow-dialog)]",
            "inset-x-0 bottom-0 rounded-t-2xl sm:inset-x-4 sm:top-[10vh] sm:bottom-auto sm:mx-auto sm:max-h-[80vh] sm:rounded-2xl",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
            wide ? "sm:max-w-2xl" : "sm:max-w-[440px]",
          )}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <RDialog.Title className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-[13px] text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <IconButton label="Close" className="-mt-1 -mr-1.5">
                <X className="size-4" aria-hidden />
              </IconButton>
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-line-soft bg-canvas/30 px-5 py-3 sm:flex-row sm:justify-end [&>button]:max-sm:h-11">
              {footer}
            </div>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/**
 * Confirmation for dangerous, irreversible or high-risk actions. `requireText` adds a typed confirmation
 * (for example the task key) so a high-risk decision cannot be made by a stray click.
 */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, danger = true, children, requireText }: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | void;
  danger?: boolean;
  children?: ReactNode;
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const blocked = requireText !== undefined && typed.trim() !== requireText;
  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog
        open={open}
        onOpenChange={(next) => { setOpen(next); if (!next) setTyped(""); }}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant={danger ? "danger" : "primary"}
              loading={busy}
              disabled={blocked}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                  setTyped("");
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
        {children ?? <p className="text-[13px] text-muted">This action is recorded in the activity log.</p>}
        {requireText !== undefined && (
          <div className="mt-4 space-y-1.5">
            <label htmlFor={inputId} className="block text-xs font-medium text-muted">
              Type <span className="font-mono text-fg">{requireText}</span> to confirm
            </label>
            <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Right-hand inspector for details, so lists keep their place. Full screen on phones. */
export function DetailPanel({ open, onOpenChange, title, subtitle, children, actions, footer, size = "md" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-scrim/70 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out lg:bg-black/25" />
        <RDialog.Content
          className={cx(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-[var(--shadow-dialog)] sm:inset-y-2 sm:right-2 sm:rounded-2xl sm:border",
            "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
            size === "lg" ? "sm:max-w-[680px]" : "sm:max-w-[520px]",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-3.5">
            <div className="min-w-0">
              <RDialog.Title className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</RDialog.Title>
              <RDialog.Description className={subtitle ? "mt-0.5 text-xs text-muted" : "sr-only"}>{subtitle ?? "Details"}</RDialog.Description>
            </div>
            <div className="flex items-center gap-1">
              {actions}
              <RDialog.Close asChild>
                <IconButton label="Close panel">
                  <X className="size-4" aria-hidden />
                </IconButton>
              </RDialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean; hint?: string } | "separator";

export function Dropdown({ trigger, items, align = "end", label }: { trigger: ReactNode; items: MenuItem[]; align?: "start" | "end"; label?: string }) {
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>{trigger}</RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content
          align={align}
          sideOffset={6}
          aria-label={label}
          className="z-50 min-w-48 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-[10px] bg-raised p-1 shadow-[var(--shadow-popover)] data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          {items.map((item, i) =>
            item === "separator" ? (
              <RDropdown.Separator key={`sep-${i}`} className="mx-1 my-1 h-px bg-line" />
            ) : (
              <RDropdown.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cx(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] outline-none select-none data-[disabled]:cursor-default data-[disabled]:text-faint data-[highlighted]:bg-hover",
                  item.danger ? "text-danger" : "text-fg",
                  !item.disabled && "cursor-pointer",
                )}
              >
                {item.icon && <span className="flex size-4 items-center justify-center text-muted [&_svg]:size-3.5">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="text-xs text-faint">{item.hint}</span>}
              </RDropdown.Item>
            ),
          )}
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <RTooltip.Root delayDuration={300}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-xs rounded-md bg-raised px-2 py-1 text-xs text-fg shadow-[var(--shadow-popover)] data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Popover({ trigger, children, align = "end", className }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; className?: string }) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          align={align}
          sideOffset={8}
          className={cx(
            "z-50 w-80 max-w-[calc(100vw-24px)] origin-[var(--radix-popover-content-transform-origin)] overflow-hidden rounded-xl bg-raised shadow-[var(--shadow-popover)] data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
            className,
          )}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
