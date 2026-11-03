import { describe, expect, it } from "vitest";

import { cx } from "@/components/ui/primitives";
import { money, percent, relative, taskTypeLabel } from "./format";

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
