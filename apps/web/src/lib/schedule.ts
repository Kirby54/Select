/** Schedules for routines: a few plain choices that map to five-field cron expressions. */

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export type Frequency = "daily" | "weekdays" | "weekly" | "monthly" | "custom";

export interface Schedule { frequency: Frequency; time: string; weekday: string; monthday: string; cron: string }

export function toCron(s: Schedule): string {
  if (s.frequency === "custom") return s.cron.trim();
  const [h = "9", m = "0"] = s.time.split(":");
  const hm = `${Number(m)} ${Number(h)}`;
  if (s.frequency === "daily") return `${hm} * * *`;
  if (s.frequency === "weekdays") return `${hm} * * 1-5`;
  if (s.frequency === "weekly") return `${hm} * * ${s.weekday}`;
  return `${hm} ${s.monthday} * *`;
}

export function fromCron(cron: string): Schedule {
  const base: Schedule = { frequency: "custom", time: "09:00", weekday: "1", monthday: "1", cron };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5 || !/^\d+$/.test(parts[0]!) || !/^\d+$/.test(parts[1]!)) return base;
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  if (mon !== "*") return base;
  if (dom === "*" && dow === "*") return { ...base, frequency: "daily", time };
  if (dom === "*" && dow === "1-5") return { ...base, frequency: "weekdays", time };
  if (dom === "*" && /^[0-6]$/.test(dow)) return { ...base, frequency: "weekly", time, weekday: dow };
  if (/^\d{1,2}$/.test(dom) && dow === "*") return { ...base, frequency: "monthly", time, monthday: dom };
  return base;
}

export function describeCron(cron: string): string {
  const s = fromCron(cron);
  if (s.frequency === "daily") return `Every day at ${s.time}`;
  if (s.frequency === "weekdays") return `Monday to Friday at ${s.time}`;
  if (s.frequency === "weekly") return `Every ${DAYS[Number(s.weekday)]} at ${s.time}`;
  if (s.frequency === "monthly") return `On day ${s.monthday} of every month at ${s.time}`;
  return `Custom schedule: ${cron}`;
}

