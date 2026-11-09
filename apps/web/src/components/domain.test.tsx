import * as RTooltip from "@radix-ui/react-tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

vi.mock("next/navigation", () => ({ useParams: () => ({ cid: "c1" }) }));

import { ApprovalCard, VerificationReceipt } from "./domain";
import type { Approval, Receipt } from "@/lib/types";

const receipt: Receipt = {
  id: "r1", run_id: "run-1", task_id: "t1", agent_id: "a1", contract_id: "quote", contract_version: 1,
  contract_sha256: "a".repeat(64), status: "failed", is_demo: false, created_at: "2026-11-03T10:00:00Z",
  body: {
    run_id: "run-1", status: "failed", missing: [], errors: [], deliverable_sha256: "b".repeat(64),
    verified_at: "2026-11-03T10:00:00Z", verifier: "select-verify/0.1.0",
    checks: [
      { id: "totals_add_up", rule: "quote_totals", description: "", blocking: true, status: "passed", message: "ok", evidence: {} },
      { id: "prices_match_catalog", rule: "catalog_price", description: "", blocking: true, status: "failed", message: "1 price(s) differ", evidence: { mismatches: [{ line: "lines[0]" }] } },
    ],
  },
};

const approval: Approval = {
  id: "ap1", task_id: "t1", task_key: "T-1", task_title: "Quote", task_type: "quote", agent_id: "a1", agent_name: "Lea",
  reason: "supervised", action: "send_quote_email", status: "pending", decided_by: null, decided_at: null, note: null,
  is_demo: false, receipt: null, created_at: "2026-11-03T10:00:00Z",
  payload: { action: "send_quote_email", preview: ["To: Jonas", "Total 873.22 EUR"], content: {}, level: "supervised" },
};

describe("VerificationReceipt", () => {
  it("shows the count, the contract fingerprint and opens the evidence of failed checks", () => {
    render(<RTooltip.Provider><VerificationReceipt receipt={receipt} /></RTooltip.Provider>);
    expect(screen.getByText("1/2 checks passed")).toBeTruthy();
    expect(screen.getByText(/quote v1 · aaaaaaaaaa/)).toBeTruthy();
    expect(screen.getByText(/"line": "lines\[0\]"/)).toBeTruthy();
  });
});

describe("ApprovalCard", () => {
  it("approves in one click and requires a note to send back", () => {
    const onDecide = vi.fn();
    render(<RTooltip.Provider><ApprovalCard approval={approval} onDecide={onDecide} busy={false} /></RTooltip.Provider>);
    expect(screen.getByText(/Total 873.22 EUR/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const send = screen.getByRole("button", { name: "Send back to the agent" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Use walnut" } });
    fireEvent.click(send);
    expect(onDecide).toHaveBeenCalledWith("changes_requested", "Use walnut");
  });

  it("asks for a typed confirmation before approving legal-risk work", () => {
    const onDecide = vi.fn();
    render(<RTooltip.Provider><ApprovalCard approval={approval} onDecide={onDecide} busy={false} risk="legal" /></RTooltip.Provider>);
    expect(screen.getByText("Legal risk")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onDecide).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Approve") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type T-1 to confirm/), { target: { value: "T-1" } });
    expect(confirm.disabled).toBe(false);
  });

  it("marks a code diff as untested and approval as review-only", () => {
    render(
      <RTooltip.Provider>
        <ApprovalCard
          approval={{
            ...approval,
            task_type: "code_change",
            action: null,
            payload: {
              ...approval.payload,
              preview: ["diff --git a/app.py b/app.py", "-old", "+new"],
            },
          }}
          onDecide={vi.fn()}
          busy={false}
          risk="high"
        />
      </RTooltip.Provider>,
    );
    expect(screen.getByText("Proposed diff — not applied")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Not tested.");
    expect(screen.getByRole("note").textContent).toContain("approving records your decision");
    expect(screen.getByText("+new").className).toContain("text-success");
  });

  it("says when a code runner's tests passed on the exact diff", () => {
    render(
      <RTooltip.Provider>
        <ApprovalCard
          approval={{
            ...approval,
            task_type: "code_change",
            action: null,
            payload: {
              ...approval.payload,
              preview: ["diff --git a/app.py b/app.py", "-old", "+new"],
              content: { tests: { command: "npm test", exit_code: 0, duration_ms: 4200, runner: "ci-box" } },
            },
          }}
          onDecide={vi.fn()}
          busy={false}
          risk="high"
        />
      </RTooltip.Provider>,
    );
    const note = screen.getByRole("note").textContent ?? "";
    expect(note).toContain("Tests passed on this exact diff");
    expect(note).toContain("npm test in 4.2 s");
    expect(note).toContain("ci-box");
  });

  it("hides decision buttons for read-only members", () => {
    render(<RTooltip.Provider><ApprovalCard approval={approval} onDecide={vi.fn()} busy={false} readOnly /></RTooltip.Provider>);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText(/Waiting for a member or admin/)).toBeTruthy();
  });
});
