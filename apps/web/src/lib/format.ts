const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return dateFmt.format(new Date(value));
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  return dayFmt.format(new Date(value));
}

export function relative(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDay(value);
}

/** Money arrives as a decimal string; format it without converting to float arithmetic. */
export function money(value: string | null | undefined, currency = "", digits = 2): string {
  if (value === null || value === undefined || value === "") return "—";
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const negative = value.startsWith("-");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const frac = (fraction + "0".repeat(digits)).slice(0, digits);
  const body = digits > 0 ? `${grouped}.${frac}` : grouped;
  return `${negative ? "−" : ""}${body}${currency ? ` ${currency}` : ""}`;
}

export function percent(rate: number | null | undefined, digits = 0): string {
  if (rate === null || rate === undefined) return "—";
  return `${(rate * 100).toFixed(digits)} %`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.replace(/[_.]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const TASK_TYPE_LABEL: Record<string, string> = {
  quote: "Quote",
  support_reply: "Support reply",
  message_triage: "Message triage",
  social_post: "Social post",
  invoice_draft: "Invoice draft",
  payment_request: "Payment request",
};

export const taskTypeLabel = (id: string) => TASK_TYPE_LABEL[id] ?? humanize(id);
