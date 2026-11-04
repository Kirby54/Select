"""End-to-end through the HTTP API: company -> agent -> task -> result -> receipt -> approval -> audit -> autonomy."""

from __future__ import annotations

import copy

from helpers import good_quote, new_quote_task, ok, pending_approval, setup_company, submit, trust_level


def test_vertical_slice(client):
    ok(client.get("/api/health"))
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    assert task["key"] == "T-1" and task["status"] == "todo"

    result = submit(client, cid, task["id"], good_quote())
    assert result["outcome"] == "awaiting_approval"
    receipt = result["receipts"][0]
    assert receipt["status"] == "verified"
    assert receipt["contract_id"] == "quote" and receipt["contract_version"] == 2
    assert {c["id"] for c in receipt["body"]["checks"]} >= {
        "prices_match_catalog",
        "totals_add_up",
        "every_number_sourced",
    }

    approval = pending_approval(client, cid, task["id"])
    assert approval["reason"] == "supervised"
    assert approval["action"] == "send_quote_email"
    # The approval shows the exact e-mail that would leave Select, in the company's language.
    preview = approval["payload"]["preview"]
    assert preview[0] == "To: jonas.weber@example.org"
    assert "- 3,2 m × Oak worktop à 189,00 € = 604,80 €" in preview
    assert "MwSt. 19\u00a0%: 139,42 €" in preview
    assert "Gesamtbetrag brutto: 873,22 €" in preview
    assert approval["payload"]["email"]["to"] == "jonas.weber@example.org"

    decided = ok(client.post(f"/api/companies/{cid}/approvals/{approval['id']}/decide", json={"decision": "approved"}))
    assert decided["status"] == "approved" and decided["decided_by"] == "Owner"

    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
    assert detail["status"] == "done"
    kinds = [h["kind"] for h in detail["history"]]
    assert kinds[:4] == ["task.created", "run.submitted", "verification.verified", "approval.requested"]
    assert "approval.approved" in kinds

    trust = trust_level(client, cid, agent_id, "quote")
    assert trust["level"] == "supervised" and trust["successes"] == 1 and trust["streak"] == 1

    overview = ok(client.get(f"/api/companies/{cid}/overview"))
    assert overview["tasks"]["done"] == 1
    assert overview["receipts"]["verified"] == 1
    assert overview["autonomy"]["finished"] == 1
    assert overview["autonomy"]["autonomous"] == 0
    # The error rate is never shown as 0 % from too small a sample.
    assert overview["autonomy"]["undetected_error_rate"] is None
    assert overview["autonomy"]["undetected_error_measurable"] is False


def test_failed_verification_needs_correction_and_never_reaches_approval(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    bad = copy.deepcopy(good_quote())
    bad["lines"][0]["unit_price"]["value"] = "1.00"
    result = submit(client, cid, task["id"], bad)
    assert result["outcome"] == "needs_correction"
    assert result["status"] == "in_progress"
    assert ok(client.get(f"/api/companies/{cid}/approvals"))["total"] == 0
    # The corrected output then goes to approval.
    fixed = submit(client, cid, task["id"], good_quote())
    assert fixed["outcome"] == "awaiting_approval"
    assert [r["status"] for r in fixed["receipts"]] == ["failed", "verified"]


def test_correction_limit_blocks_the_task(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    bad = copy.deepcopy(good_quote())
    bad["totals"]["gross"]["value"] = "999.99"
    outcomes = [submit(client, cid, task["id"], bad)["outcome"] for _ in range(3)]
    assert outcomes == ["needs_correction", "needs_correction", "blocked"]
    submit_after = client.post(f"/api/companies/{cid}/tasks/{task['id']}/submit", json={"output": good_quote()})
    # Blocked tasks may still receive a human-provided fix.
    assert submit_after.status_code == 200


def test_missing_information_blocks_without_guessing(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    incomplete = copy.deepcopy(good_quote())
    incomplete["customer"]["email"] = {"value": "", "source_ref": "source:msg-1"}
    result = submit(client, cid, task["id"], incomplete)
    assert result["outcome"] == "blocked"
    assert "customer.email" in result["comments"][-1]["body"]
    # Missing customer data is not the agent's fault: no failure is recorded against its licence.
    agent = ok(client.get(f"/api/companies/{cid}/agents/{agent_id}"))
    assert all(t["failures"] == 0 for t in agent["trust"])


def test_idempotent_submission(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    body = {"output": good_quote(), "idempotency_key": "abc-123"}
    first = ok(client.post(f"/api/companies/{cid}/tasks/{task['id']}/submit", json=body))
    second = ok(client.post(f"/api/companies/{cid}/tasks/{task['id']}/submit", json=body))
    assert len(first["runs"]) == 1 and len(second["runs"]) == 1


def test_activity_search_filter_and_export(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    submit(client, cid, task["id"], good_quote())
    items = ok(client.get(f"/api/companies/{cid}/activity", params={"kind": "verification"}))["items"]
    assert len(items) == 1 and items[0]["kind"] == "verification.verified"
    found = ok(client.get(f"/api/companies/{cid}/activity", params={"q": "Lea"}))
    assert found["total"] >= 1
    export = client.get(f"/api/companies/{cid}/activity/export")
    assert export.status_code == 200 and export.text.startswith("created_at,actor_type")
