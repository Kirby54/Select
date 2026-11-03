/**
 * Select primitives. One family per control; variants change emphasis, never shape.
 * Sizes: "sm" (28px, dense tables/toolbars) and "md" (36px, forms). Touch targets on mobile
 * get min-h-11 through the `touch` prop where a control is the main action of a screen.
 */
import { Loader2 } from "lucide-react";
import { extendTailwindMerge } from "tailwind-merge";
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// tailwind-merge resolves conflicting utilities (e.g. "w-full" then "w-40") so callers can override sizes.
const merge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["2xs"] }] } } });

export function cx(...parts: (string | false | null | undefined)[]): string {
  return merge(parts.filter(Boolean).join(" "));
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong disabled:bg-raised disabled:text-faint",
  secondary: "bg-raised text-fg border border-line hover:bg-hover disabled:text-faint",
  ghost: "text-muted hover:text-fg hover:bg-raised disabled:text-faint",
  danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25 disabled:opacity-50",
};
const SIZE: Record<Size, string> = { sm: "h-7 px-2.5 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  touch?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, touch = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors select-none disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        touch && "max-sm:min-h-11 max-sm:px-4",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, size = "sm", variant = "ghost", children, ...rest },
  ref,
) {
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} size={size} className={cx(size === "sm" ? "w-7 px-0 max-sm:size-10" : "w-9 px-0 max-sm:size-11", className)} {...rest}>
      {children}
    </Button>
  );
});

const CONTROL =
  "w-full rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-faint transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-none aria-[invalid=true]:border-danger disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(CONTROL, "h-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(CONTROL, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(CONTROL, "h-9 appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a7b0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, description, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 py-1">
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-line bg-surface accent-[var(--color-accent)]" {...rest} />
      <span>
        <span className="text-sm text-fg">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Field({ label, error, hint, htmlFor, children, required }: { label: string; error?: string; hint?: string; htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
        {label}
        {required && <span className="text-faint"> · required</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

type Tone = "neutral" | "accent" | "supervised" | "sampled" | "autonomous" | "danger" | "success" | "warning";
const TONE: Record<Tone, string> = {
  neutral: "bg-raised text-muted border-line",
  accent: "bg-accent/12 text-accent border-accent/30",
  supervised: "bg-supervised/12 text-supervised border-supervised/30",
  sampled: "bg-sampled/12 text-sampled border-sampled/30",
  autonomous: "bg-autonomous/12 text-autonomous border-autonomous/30",
  danger: "bg-danger/12 text-danger border-danger/30",
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/12 text-warning border-warning/30",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-2xs font-medium whitespace-nowrap", TONE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-raised", className)} aria-hidden />;
}

export function Progress({ value, max = 1, tone = "accent", label }: { value: number; max?: number; tone?: "accent" | "autonomous" | "danger" | "supervised"; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { accent: "bg-accent", autonomous: "bg-autonomous", danger: "bg-danger", supervised: "bg-supervised" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={cx("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface px-1.5 font-mono text-2xs text-muted">{children}</kbd>;
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-lg border border-line bg-card", className)}>{children}</As>;
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" | "autonomous" }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("mt-1 text-xl font-semibold tabular", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "autonomous" ? "text-autonomous" : "text-fg")}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-faint">{hint}</div>}
    </div>
  );
}
