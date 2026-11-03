import * as RTooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("hides decision buttons for read-only members", () => {
    render(<RTooltip.Provider><ApprovalCard approval={approval} onDecide={vi.fn()} busy={false} readOnly /></RTooltip.Provider>);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText(/Waiting for a member or admin/)).toBeTruthy();
  });
});
