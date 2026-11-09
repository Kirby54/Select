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

/** Past dates read "5 min ago", future ones "in 5 min" (next runs of a routine). */
export function relative(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const say = (amount: string) => (seconds < 0 ? `in ${amount}` : `${amount} ago`);
  const minutes = Math.round(Math.abs(seconds) / 60);
  if (minutes < 60) return say(`${minutes} min`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return say(`${hours} h`);
  const days = Math.round(hours / 24);
  if (days < 30) return say(`${days} d`);
  return formatDay(value);
}

/** A date and time as the clock reads in `timeZone` (a routine's or the company's), e.g. "Mon 09 Nov, 08:00". */
export function formatDateIn(value: string | null | undefined, timeZone: string | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
  } catch {
    // An unknown time zone name (RangeError): fall back to the viewer's own clock.
    return formatDate(value);
  }
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
  general_task: "Free-form task",
};

export const taskTypeLabel = (id: string) => TASK_TYPE_LABEL[id] ?? humanize(id);

/** Free-form work: any agent may take it, and a person reviews every result (its contract says "always"). */
export const FREE_FORM = "general_task";

/** Where an inbox item leads: the approval queue, the e-mail, the task or the agent. */
export function inboxHref(cid: string, item: { kind: string; task_id?: string; agent_id?: string; message_id?: string; id: string }): string {
  if (item.kind === "approval") return `/c/${cid}/approvals`;
  if (item.kind === "message") return `/c/${cid}/messages?m=${item.message_id ?? item.id}`;
  if (item.kind === "delivery") return `/c/${cid}/messages?view=outbox`;
  if (item.task_id) return `/c/${cid}/tasks/${item.task_id}`;
  if (item.agent_id) return `/c/${cid}/agents/${item.agent_id}`;
  return `/c/${cid}/inbox`;
}

/** "0.055" -> "5.5 %": VAT rates are stored as fractions. */
export function ratePercent(rate: string): string {
  const [whole = "0", fraction = ""] = rate.split(".");
  const digits = `${whole}${fraction.padEnd(2, "0")}`;
  const integer = digits.slice(0, whole.length + 2).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(whole.length + 2).replace(/0+$/, "");
  return `${integer}${rest ? `.${rest}` : ""} %`;
}

/** "5.5" (percent) -> "0.055" (fraction), with string arithmetic only. Returns null if not a percentage. */
export function fractionFromPercent(value: string): string | null {
  const text = value.trim().replace(",", ".").replace(/\s*%$/, "");
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  const digits = `${whole.padStart(2, "0")}${fraction}`.replace(/0+$/, "");
  if (!digits || /^0+$/.test(digits)) return "0";
  return `0.${digits.padEnd(2, "0")}`;
}
