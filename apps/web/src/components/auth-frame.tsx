import type { ReactNode } from "react";

import { Logo } from "@/components/shell/logo";
import { Card } from "@/components/ui/primitives";

/** The quiet frame around sign-in, first-account setup and invitations. */
export function AuthFrame({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center sm:py-16">
      <div className="w-full max-w-[400px] animate-rise-in">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-fg text-canvas shadow-[var(--shadow-popover)]">
            <Logo className="size-5" title="" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Select</p>
            <p className="text-xs text-muted">Agents that earn their autonomy</p>
          </div>
        </div>
        <h1 className="mt-8 text-xl font-bold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p>}
        <Card className="mt-6 p-4 sm:p-5">{children}</Card>
        {footer && <div className="mt-4 text-center text-xs text-muted">{footer}</div>}
      </div>
    </main>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">{message}</p>;
}
