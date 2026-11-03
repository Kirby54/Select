"use client";

/** Toasts, empty/error/loading states and the demo banner. */
import { AlertTriangle, CheckCircle2, Info, Lock, RefreshCw, WifiOff, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError, errorMessage } from "@/lib/api";
import { Button, Skeleton, cx } from "./primitives";

interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  description?: string;
}

const ToastContext = createContext<{ show: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (t: Omit<Toast, "id">) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((all) => [...all.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === "error" ? 7000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-2.5 rounded-lg border border-line bg-raised px-3.5 py-3 shadow-lg shadow-black/30">
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss notification">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Explains what went wrong and what to do; handles offline, forbidden and generic errors. */
export function ErrorState({ error, retry, compact }: { error: unknown; retry?: () => void; compact?: boolean }) {
  const api = error instanceof ApiError ? error : null;
  const icon = api?.isUnreachable ? <WifiOff /> : api?.isForbidden ? <Lock /> : <AlertTriangle />;
  const title = api?.isUnreachable
    ? "Select's backend is unreachable"
    : api?.isForbidden
      ? "You don't have access to this"
      : api?.status === 404
        ? "Not found"
        : "This could not be loaded";
  const detail = api?.isUnreachable
    ? "The API or the database is not responding. If you run Select locally, check `docker compose ps`."
    : errorMessage(error);
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-14")} role="alert">
      <div className="mb-3 text-danger [&_svg]:size-6">{icon}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{detail}</p>
      {retry && (
        <Button className="mt-4" size="sm" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-sampled/25 bg-sampled/8 px-4 py-1.5 text-xs text-sampled" role="note">
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Demo company.</strong> Agent outputs are recorded and replayed; no model is called. Checks, receipts and autonomy run for real.
      </span>
    </div>
  );
}
