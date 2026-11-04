import { describe, expect, it } from "vitest";

import { describeCron, fromCron, toCron } from "./schedule";

describe("routine schedules", () => {
  it("turns plain choices into cron and back", () => {
    const weekly = { frequency: "weekly" as const, time: "08:30", weekday: "1", monthday: "1", cron: "" };
    expect(toCron(weekly)).toBe("30 8 * * 1");
    expect(fromCron("30 8 * * 1")).toMatchObject({ frequency: "weekly", time: "08:30", weekday: "1" });
    expect(toCron({ ...weekly, frequency: "monthly", monthday: "15" })).toBe("30 8 15 * *");
    expect(toCron({ ...weekly, frequency: "weekdays" })).toBe("30 8 * * 1-5");
  });

  it("describes schedules in words, and keeps unusual ones as cron", () => {
    expect(describeCron("0 9 * * 1")).toBe("Every Monday at 09:00");
    expect(describeCron("0 7 * * 1-5")).toBe("Monday to Friday at 07:00");
    expect(describeCron("15 18 * * *")).toBe("Every day at 18:15");
    expect(describeCron("0 8 1 * *")).toBe("On day 1 of every month at 08:00");
    expect(describeCron("*/30 9-17 * * 1-5")).toBe("Custom schedule: */30 9-17 * * 1-5");
  });
});
