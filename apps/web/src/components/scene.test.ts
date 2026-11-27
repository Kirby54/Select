import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/c/c1/overview" }));

import type { Agent, Overview } from "@/lib/types";
import { APEX_Y, LEVEL_GAP, defaultLayout } from "./org-pyramid-3d";
import { taskBands } from "./scene-backdrop";

function agent(id: string, manager_id: string | null, position = 0): Agent {
  return {
    id, name: id, role: "Role", description: "", objectives: "", instructions: "", manager_id, position,
    provider: null, model: null, task_types: [], permissions: [], monthly_budget: "0", status: "active",
    version: 1, is_demo_agent: false, connected: null, working: 0, trust: [], created_at: "", updated_at: "",
  };
}

describe("taskBands", () => {
  it("stacks the statuses from done (base) to blocked (apex) with the real counts", () => {
    const tasks = { done: 52, todo: 1, in_progress: 2, awaiting_approval: 3, blocked: 4 };
    const bands = taskBands({ tasks } as unknown as Overview, "c1");
    expect(bands.map((b) => b.key)).toEqual(["done", "todo", "in_progress", "awaiting_approval", "blocked"]);
    expect(bands.map((b) => b.count)).toEqual([52, 1, 2, 3, 4]);
    expect(bands.find((b) => b.key === "awaiting_approval")?.href).toBe("/c/c1/approvals");
  });

  it("shows zeros, not invented figures, while the overview is loading", () => {
    expect(taskBands(undefined, "c1").every((b) => b.count === 0)).toBe(true);
  });
});

describe("defaultLayout (3D org pyramid)", () => {
  it("puts the agent nobody manages at the apex and each level of reports lower", () => {
    const layout = defaultLayout([agent("boss", null), agent("a", "boss"), agent("b", "boss"), agent("c", "a")]);
    const y = (id: string) => layout[id]![1];
    expect(y("boss")).toBeCloseTo(APEX_Y - 0.35);
    expect(y("a")).toBeCloseTo(y("boss") - LEVEL_GAP);
    expect(y("b")).toBeCloseTo(y("a"));
    expect(y("c")).toBeCloseTo(y("a") - LEVEL_GAP);
    // a lone boss sits on the axis; colleagues on a level are spread apart
    expect(layout.boss![0]).toBeCloseTo(0);
    expect(Math.hypot(layout.a![0] - layout.b![0], layout.a![2] - layout.b![2])).toBeGreaterThan(0.3);
  });

  it("places every agent, even with a manager outside the list or a loop in stale data", () => {
    const layout = defaultLayout([agent("x", "missing"), agent("p", "q"), agent("q", "p")]);
    expect(Object.keys(layout).sort()).toEqual(["p", "q", "x"]);
    for (const pos of Object.values(layout)) expect(pos.every(Number.isFinite)).toBe(true);
  });
});
