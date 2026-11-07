"""Evidence-bound code proposal permissions: resource isolation, expiry, revocation and contracts."""

from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from helpers import ok, setup_company
from select_api import capabilities
from select_api.db import session_scope
from select_api.models import Agent

REPO_A = "repo:Kirby54/Select"
REPO_B = "repo:OtherOrg/Production"


def coding_agent(client):
    cid, aid = setup_company(client)
    agent = ok(client.get(f"/api/companies/{cid}/agents/{aid}"))
    ok(client.patch(
        f"/api/companies/{cid}/agents/{aid}",
        json={"version": agent["version"], "task_types": [*agent["task_types"], "code_change"]},
    ))
    return cid, aid


def grant(client, cid, aid, scope=REPO_A, days=30):
    return ok(client.post(
        f"/api/companies/{cid}/agents/{aid}/capabilities",
        json={"scope": scope, "days": days},
    ), 201)


def new_code_task(client, cid, aid, scope=REPO_A):
    return client.post(
        f"/api/companies/{cid}/tasks",
        json={"title": "Review a code patch", "task_type": "code_change",
              "assignee_id": aid, "resource_scope": scope},
    )


def test_scope_is_deny_by_default_and_does_not_allow_email_or_other_repository(client):
    cid, aid = coding_agent(client)
    assert new_code_task(client, cid, aid).status_code == 403
    issued = grant(client, cid, aid)
    assert issued["status"] == "active"
    assert issued["scope"] == REPO_A
    assert issued["contract_version"] == 1
    assert issued["contract_sha256"]
    ok(new_code_task(client, cid, aid), 201)
    assert new_code_task(client, cid, aid, REPO_B).status_code == 403
    checks = f"/api/companies/{cid}/agents/{aid}/capabilities/check"
    allowed = ok(client.post(checks, json={"action": "code_change", "scope": REPO_A}))
    assert allowed["allowed"] is True
    denied_repo = ok(client.post(checks, json={"action": "code_change", "scope": REPO_B}))
    assert denied_repo["allowed"] is False
    for action in ("send_customer_email", "modify_production"):
        result = ok(client.post(checks, json={"action": action, "scope": REPO_A}))
        assert result["allowed"] is False
        assert "not grantable" in result["reason"]


def test_revocation_blocks_existing_task_before_submission(client):
    cid, aid = coding_agent(client)
    issued = grant(client, cid, aid)
    task = ok(new_code_task(client, cid, aid), 201)
    ok(client.post(f"/api/companies/{cid}/agents/{aid}/capabilities/{issued['id']}/revoke"))
    response = client.post(
        f"/api/companies/{cid}/tasks/{task['id']}/submit",
        json={"output": {"summary": "test", "diff": "not a patch"}},
    )
    assert response.status_code == 403
    assert "no active" in response.text
    grants = ok(client.get(f"/api/companies/{cid}/agents/{aid}/capabilities"))
    assert grants["grants"][0]["status"] == "revoked"
    assert client.post(f"/api/companies/{cid}/agents/{aid}/capabilities/{issued['id']}/revoke").status_code == 409


def test_expired_grant_blocks_existing_task_and_can_be_replaced(client):
    cid, aid = coding_agent(client)
    grant(client, cid, aid, days=1)
    task = ok(new_code_task(client, cid, aid), 201)
    with session_scope() as db:
        agent = db.get(Agent, UUID(aid))
        assert agent is not None
        config = copy.deepcopy(agent.config)
        config[capabilities.KEY][0]["expires_at"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
        agent.config = config
    assert client.post(f"/api/companies/{cid}/tasks/{task['id']}/run").status_code == 409
    assert client.post(
        f"/api/companies/{cid}/tasks/{task['id']}/submit",
        json={"output": {"summary": "review", "diff": "not a patch"}},
    ).status_code == 403
    assert ok(client.get(f"/api/companies/{cid}/agents/{aid}/capabilities"))["grants"][0]["status"] == "expired"
    renewed = grant(client, cid, aid, days=7)
    assert renewed["id"]


def test_contract_hash_change_invalidates_grant(client, monkeypatch: pytest.MonkeyPatch):
    cid, aid = coding_agent(client)
    grant(client, cid, aid)
    original = capabilities.get_contract
    class ChangedContract:
        id = "code_change"
        version = 2
        risk = "high"
        sha256 = "f" * 64
    monkeypatch.setattr(
        capabilities, "get_contract", lambda kind: ChangedContract() if kind == "code_change" else original(kind)
    )
    rows = ok(client.get(f"/api/companies/{cid}/agents/{aid}/capabilities"))["grants"]
    assert rows[0]["status"] == "contract_changed"
    assert new_code_task(client, cid, aid).status_code == 403


def test_grants_cannot_be_issued_outside_assigned_agent_or_other_company(client):
    cid, aid = coding_agent(client)
    other_cid, _ = setup_company(client)
    response = client.post(
        f"/api/companies/{other_cid}/agents/{aid}/capabilities",
        json={"scope": REPO_A, "days": 30},
    )
    assert response.status_code == 404
    assert client.get(f"/api/companies/{other_cid}/agents/{aid}/capabilities").status_code == 404
    assert client.post(f"/api/companies/{cid}/agents/{aid}/capabilities",
        json={"scope": "repo:owner/../secret", "days": 30}).status_code == 422
    assert client.post(f"/api/companies/{cid}/agents/{aid}/capabilities",
        json={"scope": REPO_A, "days": 91}).status_code == 422


def test_verified_proposal_requires_human_approval_and_does_not_grant_other_rights(client):
    cid, aid = coding_agent(client)
    grant(client, cid, aid)
    task = ok(new_code_task(client, cid, aid), 201)
    patch = (
        "diff --git a/src/app.py b/src/app.py\n"
        "--- a/src/app.py\n"
        "+++ b/src/app.py\n"
        "@@ -1 +1 @@\n"
        "-print(1)\n"
        "+print(2)\n"
    )
    result = ok(client.post(
        f"/api/companies/{cid}/tasks/{task['id']}/submit",
        json={"output": {"summary": "Change one printed number", "diff": patch}},
    ))
    assert result["outcome"] == "awaiting_approval"
    assert result["receipts"][0]["status"] == "verified"
    assert result["resource_scope"] == REPO_A
    approvals = ok(client.get(f"/api/companies/{cid}/approvals"))["items"]
    assert len(approvals) == 1
    assert approvals[0]["status"] == "pending"
    assert new_code_task(client, cid, aid, REPO_B).status_code == 403
    assert ok(client.post(
        f"/api/companies/{cid}/agents/{aid}/capabilities/check",
        json={"action": "send_customer_email", "scope": REPO_A},
    ))["allowed"] is False


def test_other_agent_cannot_inherit_grant_by_reassignment(client):
    cid, aid = coding_agent(client)
    grant(client, cid, aid)
    task = ok(new_code_task(client, cid, aid), 201)
    second = ok(client.post(f"/api/companies/{cid}/agents",
        json={"name": "Other coder", "role": "Developer", "task_types": ["code_change"]}), 201)
    response = client.patch(
        f"/api/companies/{cid}/tasks/{task['id']}",
        json={"version": task["version"], "assignee_id": second["id"]},
    )
    assert response.status_code == 403
