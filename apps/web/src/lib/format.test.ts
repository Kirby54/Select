import { describe, expect, it } from "vitest";

import { cx } from "@/components/ui/primitives";
import { formatDateIn, money, percent, ratePercent, relative, taskTypeLabel } from "./format";

describe("money", () => {
  it("formats decimal strings without float arithmetic", () => {
    expect(money("873.22", "EUR")).toBe("873.22 EUR");
    expect(money("1284.6")).toBe("1 284.60");
    expect(money("0.0036", "", 4)).toBe("0.0036");
    expect(money("-12.5")).toBe("−12.50");
  });
  it("shows a dash for missing values", () => {
    expect(money(null)).toBe("—");
    expect(money("")).toBe("—");
  });
});

describe("percent", () => {
  it("renders rates and unknown values honestly", () => {
    expect(percent(0.3921)).toBe("39 %");
    expect(percent(0.031, 1)).toBe("3.1 %");
    expect(percent(null)).toBe("—");
  });
});

describe("relative", () => {
  it("describes elapsed time", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(relative("2026-11-03T11:59:50Z", now)).toBe("just now");
    expect(relative("2026-11-03T11:30:00Z", now)).toBe("30 min ago");
    expect(relative("2026-11-01T12:00:00Z", now)).toBe("2 d ago");
    expect(relative("2026-11-03T12:30:00Z", now)).toBe("in 30 min");
    expect(relative("2026-11-09T07:00:00Z", now)).toBe("in 6 d");
  });
});

describe("cx", () => {
  it("lets a caller override a conflicting utility", () => {
    expect(cx("h-9 w-full text-sm", "h-8 w-40 text-xs")).toBe("h-8 w-40 text-xs");
    expect(cx("text-2xs", "text-fg")).toBe("text-2xs text-fg");
  });
});

it("labels task types", () => {
  expect(taskTypeLabel("support_reply")).toBe("Support reply");
  expect(taskTypeLabel("custom_type")).toBe("Custom type");
});

describe("ratePercent", () => {
  it("writes stored fractions as percentages without float arithmetic", () => {
    expect(ratePercent("0.20")).toBe("20 %");
    expect(ratePercent("0.055")).toBe("5.5 %");
    expect(ratePercent("0.021")).toBe("2.1 %");
    expect(ratePercent("0.081")).toBe("8.1 %");
    expect(ratePercent("0")).toBe("0 %");
    expect(ratePercent("0.19")).toBe("19 %");
  });
});

describe("formatDateIn", () => {
  it("reads the clock of the routine's time zone, not the viewer's", () => {
    // Monday 9 November 2026, 07:00 UTC is 08:00 in Paris and 02:00 in New York.
    expect(formatDateIn("2026-11-09T07:00:00Z", "Europe/Paris")).toBe("Mon 09 Nov, 08:00");
    expect(formatDateIn("2026-11-09T07:00:00Z", "America/New_York")).toBe("Mon 09 Nov, 02:00");
  });
});
