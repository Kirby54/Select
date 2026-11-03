/**
 * SELECT Graphite primitives. One family per control: variants change emphasis, never shape.
 * Sizes: sm 28 px (toolbars, tables) · md 32 px (default) · lg 36 px (primary actions on a screen).
 * `touch` grows a control to 44 px on phones where it is the main action.
 */
import { Loader2 } from "lucide-react";
import { extendTailwindMerge } from "tailwind-merge";
import {
  forwardRef,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

// tailwind-merge resolves conflicting utilities so a caller's "w-40" reliably beats a component's "w-full".
const merge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["2xs", "hero"] }] } } });

export function cx(...parts: (string | false | null | undefined)[]): string {
  return merge(parts.filter(Boolean).join(" "));
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-accent-strong disabled:bg-surface-2 disabled:text-ghost disabled:shadow-none",
  secondary: "border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-raised disabled:text-ghost",
  ghost: "text-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg disabled:text-ghost",
  danger: "border border-danger/30 bg-danger/10 text-danger hover:border-danger/45 hover:bg-danger/16 disabled:opacity-50",
  link: "h-auto px-0 text-accent underline-offset-4 hover:text-accent-strong hover:underline",
};
const SIZE: Record<Size, string> = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-[13px]",
  md: "h-8 gap-2 rounded-lg px-3 text-[13px]",
  lg: "h-9 gap-2 rounded-lg px-3.5 text-sm",
};

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
        "relative inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[background-color,border-color,color,transform] duration-[120ms] ease-out active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100",
        SIZE[size],
        VARIANT[variant],
        touch && "max-sm:min-h-11 max-sm:px-4 max-sm:text-sm",
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
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={cx(size === "sm" ? "w-7 px-0 max-sm:size-10" : size === "md" ? "w-8 px-0 max-sm:size-11" : "w-9 px-0 max-sm:size-11", className)}
      {...rest}
    >
      {children}
    </Button>
  );
});

const CONTROL = cx(
  "w-full rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] text-fg placeholder:text-faint",
  "transition-[border-color,box-shadow,background-color] duration-[120ms] ease-out hover:border-line-strong",
  "focus-visible:border-accent/70 focus-visible:shadow-[0_0_0_3px_rgb(165_180_200/0.18)] focus-visible:outline-none",
  "aria-[invalid=true]:border-danger/70 disabled:cursor-not-allowed disabled:opacity-55",
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(CONTROL, "h-8", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(CONTROL, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
});

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394949b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E\")";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, style, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cx(CONTROL, "h-8 appearance-none bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-7", className)}
      style={{ backgroundImage: CHEVRON, ...style }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex items-start gap-2.5 py-1", className)}>
      <input id={id} type="checkbox" className="sel-check mt-0.5 shrink-0" {...rest} />
      <span className="min-w-0">
        <span className="text-[13px] text-fg">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

/** macOS-style switch: a real `role="switch"` button, so it is keyboard and screen-reader native. */
export function Switch({ checked, onCheckedChange, label, disabled, id }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cx(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full border transition-colors duration-[180ms] ease-out disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-accent bg-accent" : "border-line-strong bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "size-3 rounded-full shadow-sm transition-transform duration-[260ms] ease-spring",
          checked ? "translate-x-[13px] bg-on-accent" : "translate-x-[2px] bg-muted",
        )}
      />
    </button>
  );
}

/**
 * Segmented control (view toggles, periods). A radiogroup with roving focus: arrows move,
 * the selected segment is the only tab stop.
 */
export function Segmented<T extends string>({ value, onChange, options, label, size = "sm", className }: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-[120ms] ease-out",
              size === "sm" ? "h-6 text-xs" : "h-7 text-[13px]",
              selected ? "bg-raised text-fg shadow-[0_1px_2px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.05)]" : "text-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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

export type Tone = "neutral" | "accent" | "supervised" | "sampled" | "autonomous" | "danger" | "success" | "warning";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent/12 text-accent ring-accent/20",
  supervised: "bg-supervised/12 text-supervised ring-supervised/20",
  sampled: "bg-sampled/12 text-sampled ring-sampled/20",
  autonomous: "bg-autonomous/12 text-autonomous ring-autonomous/20",
  danger: "bg-danger/12 text-danger ring-danger/22",
  success: "bg-success/12 text-success ring-success/20",
  warning: "bg-warning/12 text-warning ring-warning/20",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** A small "Demo" tag next to any number or row that comes from recorded demo data. */
export function DemoTag({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex h-[18px] items-center rounded-[5px] border border-dashed border-line-strong px-1.5 text-2xs font-medium tracking-wide text-faint uppercase", className)}>
      Demo
    </span>
  );
}

export function StatusDot({ tone = "neutral", pulse, label }: { tone?: Tone; pulse?: boolean; label?: string }) {
  const color = {
    neutral: "bg-faint", accent: "bg-accent", supervised: "bg-supervised", sampled: "bg-sampled",
    autonomous: "bg-autonomous", danger: "bg-danger", success: "bg-success", warning: "bg-warning",
  }[tone];
  return (
    <span className="relative inline-flex size-2 shrink-0" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pulse && <span className={cx("absolute inset-0 animate-ping rounded-full opacity-40", color)} />}
      <span className={cx("relative size-2 rounded-full", color)} />
    </span>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-faint", className)} role="status" aria-label={label} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-surface-2 [animation-duration:1.6s]", className)} aria-hidden />;
}

export function Progress({ value, max = 1, tone = "accent", label, className }: { value: number; max?: number; tone?: "accent" | "autonomous" | "danger" | "supervised" | "sampled"; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { accent: "bg-accent", autonomous: "bg-autonomous", danger: "bg-danger", supervised: "bg-supervised", sampled: "bg-sampled" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cx("h-1 w-full overflow-hidden rounded-full bg-line-soft", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cx("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-line bg-surface-2 px-1 font-sans text-2xs font-medium text-faint shadow-[inset_0_-1px_0_rgb(0_0_0/0.3)]", className)}>
      {children}
    </kbd>
  );
}

export function Card({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; "aria-label"?: string }) {
  return <As className={cx("rounded-xl border border-line bg-surface shadow-[var(--shadow-sheen)]", className)} {...rest}>{children}</As>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-h-11 items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** A compact figure: label, value, one line of context. Numbers are tabular. */
export function Stat({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" | "autonomous"; className?: string }) {
  return (
    <div className={cx("min-w-0 px-4 py-3", className)}>
      <div className="truncate text-xs text-muted">{label}</div>
      <div
        className={cx(
          "mt-1 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular",
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "autonomous" ? "text-autonomous" : "text-fg",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-faint">{hint}</div>}
    </div>
  );
}
