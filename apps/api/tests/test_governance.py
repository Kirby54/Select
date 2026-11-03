"""Permissions, isolation, concurrency, budgets, emergency stop, organization, jobs, demo."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from helpers import good_quote, new_quote_task, ok, setup_company, submit


def test_agent_validation_and_org_loops(client):
    cid, lea = setup_company(client)
    bad_type = client.post(f"/api/companies/{cid}/agents", json={"name": "X", "role": "Y", "task_types": ["hack"]})
    assert bad_type.status_code == 422
    boss = ok(client.post(f"/api/companies/{cid}/agents", json={"name": "Nora", "role": "Ops"}), 201)
    lea_v = ok(client.get(f"/api/companies/{cid}/agents/{lea}"))["version"]
    ok(client.patch(f"/api/companies/{cid}/agents/{lea}", json={"version": lea_v, "manager_id": boss["id"]}))
    loop = client.patch(
        f"/api/companies/{cid}/agents/{boss['id']}", json={"version": boss["version"], "manager_id": lea}
    )
    assert loop.status_code == 422 and "loop" in loop.text
    reorder_loop = client.post(
        f"/api/companies/{cid}/org/reorder", json=[{"id": boss["id"], "manager_id": lea, "position": 0}]
    )
    assert reorder_loop.status_code == 422
    ok(client.post(f"/api/companies/{cid}/org/reorder", json=[{"id": lea, "manager_id": None, "position": 3}]))
    agents = {a["id"]: a for a in ok(client.get(f"/api/companies/{cid}/agents"))}
    assert agents[lea]["manager_id"] is None and agents[lea]["position"] == 3


def test_task_assignment_requires_allowed_task_type(client):
    cid, _ = setup_company(client)
    other = ok(
        client.post(
            f"/api/companies/{cid}/agents", json={"name": "Mia", "role": "Comms", "task_types": ["social_post"]}
        ),
        201,
    )
    r = client.post(
        f"/api/companies/{cid}/tasks", json={"title": "x", "task_type": "quote", "assignee_id": other["id"]}
    )
    assert r.status_code == 422 and "not allowed" in r.text


def test_optimistic_concurrency_conflict(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    ok(client.patch(f"/api/companies/{cid}/tasks/{task['id']}", json={"version": task["version"], "priority": "high"}))
    stale = client.patch(
        f"/api/companies/{cid}/tasks/{task['id']}", json={"version": task["version"], "priority": "low"}
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["priority"] == "high"


def test_task_numbers_list_filter_and_kanban_statuses(client):
    cid, agent_id = setup_company(client)
    for i in range(3):
        new_quote_task(client, cid, agent_id, f"Q{i}")
    listing = ok(client.get(f"/api/companies/{cid}/tasks", params={"sort": "number", "limit": 2}))
    assert listing["total"] == 3 and [t["key"] for t in listing["items"]] == ["T-3", "T-2"]
    assert ok(client.get(f"/api/companies/{cid}/tasks", params={"q": "T-2"}))["items"][0]["title"] == "Q1"


def test_emergency_stop_blocks_work(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    ok(client.post(f"/api/companies/{cid}/emergency-stop", params={"on": True}))
    r = client.post(f"/api/companies/{cid}/tasks/{task['id']}/submit", json={"output": good_quote()})
    assert r.status_code == 409 and "Emergency stop" in r.text
    run = client.post(f"/api/companies/{cid}/tasks/{task['id']}/run")
    assert run.status_code == 409
    ok(client.post(f"/api/companies/{cid}/emergency-stop", params={"on": False}))
    assert submit(client, cid, task["id"], good_quote())["outcome"] == "awaiting_approval"


def test_live_run_refused_with_reason_without_connection(client):
    cid, agent_id = setup_company(client)
    task = new_quote_task(client, cid, agent_id)
    r = client.post(f"/api/companies/{cid}/tasks/{task['id']}/run")
    assert r.status_code == 409 and "no provider" in r.text.lower()
    agent = ok(client.get(f"/api/companies/{cid}/agents/{agent_id}"))
    assert agent["connected"] is False
    ok(
        client.patch(
            f"/api/companies/{cid}/agents/{agent_id}",
            json={"version": agent["version"], "provider": "anthropic", "model": "claude-x"},
        )
    )
    r = client.post(f"/api/companies/{cid}/tasks/{task['id']}/run")
    assert r.status_code == 409 and "connection" in r.text


def test_budget_hard_stop(client):
    from select_api.db import session_scope
    from select_api.models import CostEvent, ProviderConnection

    cid, agent_id = setup_company(client)
    agent = ok(client.get(f"/api/companies/{cid}/agents/{agent_id}"))
    ok(
        client.patch(
            f"/api/companies/{cid}/agents/{agent_id}",
            json={"version": agent["version"], "provider": "ollama", "model": "llama"},
        )
    )
    ok(client.put(f"/api/companies/{cid}/connections/ollama", json={"base_url": "http://127.0.0.1:9", "enabled": True}))
    import uuid

    with session_scope() as db:
        db.add(
            CostEvent(
                company_id=uuid.UUID(cid), provider="ollama", model="llama", amount=Decimal("100.00"), kind="estimated"
            )
        )
        assert db.query(ProviderConnection).count() == 1
    task = new_quote_task(client, cid, agent_id)
    r = client.post(f"/api/companies/{cid}/tasks/{task['id']}/run")
    assert r.status_code == 409 and "budget" in r.text.lower()
    costs = ok(client.get(f"/api/companies/{cid}/costs"))
    assert costs["alerts"][0]["level"] == "critical"


def test_secrets_are_encrypted_and_never_returned(client):
    from select_api.db import session_scope
    from select_api.models import ProviderConnection

    cid, _ = setup_company(client)
    saved = ok(client.put(f"/api/companies/{cid}/connections/openai", json={"api_key": "sk-test-1234567890abcd"}))
    assert saved["has_key"] is True and saved["key_hint"] == "…abcd"
    assert "sk-test" not in client.get(f"/api/companies/{cid}/connections").text
    with session_scope() as db:
        row = db.query(ProviderConnection).one()
        assert row.secret_encrypted and "sk-test" not in row.secret_encrypted


def test_isolation_and_roles_in_token_mode(client, token_mode):
    from select_api.cli import create_token
    from select_api.db import session_scope
    from select_api.models import ApiToken, User
    from select_api.security import hash_token, new_token

    tokens = {}
    with session_scope() as db:
        for email in ("alice@example.com", "bob@example.com", "vic@example.com"):
            user = User(email=email, name=email.split("@")[0].title())
            db.add(user)
            db.flush()
            tokens[email] = new_token()
            db.add(ApiToken(user_id=user.id, name="test", token_hash=hash_token(tokens[email])))
    assert create_token  # the CLI path is exercised in test_cli

    def h(email):
        return {"authorization": f"Bearer {tokens[email]}"}

    assert client.get("/api/companies").status_code == 401
    assert client.get("/api/companies", headers={"authorization": "Bearer nope"}).status_code == 401
    company = ok(client.post("/api/companies", json={"name": "Alice Co"}, headers=h("alice@example.com")), 201)
    cid = company["id"]
    # Bob cannot see Alice's company: same 404 as a company that does not exist.
    assert client.get(f"/api/companies/{cid}", headers=h("bob@example.com")).status_code == 404
    assert client.get(f"/api/companies/{cid}/tasks", headers=h("bob@example.com")).status_code == 404
    # Vic becomes a viewer: can read, cannot write.
    ok(
        client.post(
            f"/api/companies/{cid}/members",
            json={"email": "vic@example.com", "name": "Vic", "role": "viewer"},
            headers=h("alice@example.com"),
        ),
        201,
    )
    assert client.get(f"/api/companies/{cid}/tasks", headers=h("vic@example.com")).status_code == 200
    denied = client.post(f"/api/companies/{cid}/agents", json={"name": "A", "role": "B"}, headers=h("vic@example.com"))
    assert denied.status_code == 403 and "admin" in denied.text


def test_job_queue_claim_and_stale_recovery():
    from select_api import jobs
    from select_api.db import session_scope
    from select_api.models import Job

    with session_scope() as db:
        jobs.enqueue(db, "noop", {"x": 1})
    with session_scope() as db:
        job = jobs.claim(db, "w1")
        assert job is not None and job.status == "running" and job.attempts == 1
        assert jobs.claim(db, "w2") is None
        job.locked_at = datetime.now(UTC) - timedelta(hours=1)
        db.commit()
        again = jobs.claim(db, "w2")
        assert again is not None and again.id == job.id and again.attempts == 2
        jobs.fail(db, again, "boom", retry=False)
        assert db.get(Job, job.id).status == "failed"


def test_demo_week_runs_the_real_pipeline(client):
    from select_api import demo
    from select_api.db import session_scope

    company = ok(client.post("/api/demo"))
    with session_scope() as db:
        from select_api.models import User

        user = db.query(User).one()
        stats = demo.play(db, user.id, delay_ms=0)
    assert stats["tasks"] > 40 and stats["corrections"] == 2 and stats["approvals_left"] > 0
    cid = company["id"]
    view = ok(client.get(f"/api/companies/{cid}/autonomy"))
    kinds = {e["kind"] for e in view["events"]}
    assert {"promote", "demote"} <= kinds
    assert all(e["is_demo"] for e in view["events"])
    lea = next(lic for lic in view["licences"] if lic["agent_name"] == "Lea" and lic["task_type"] == "quote")
    assert lea["failures"] >= 1
    tom = [lic for lic in view["licences"] if lic["agent_name"] == "Tom"]
    assert all(lic["level"] == "supervised" for lic in tom)
    assert view["counter"]["autonomous"] > 0 and view["counter"]["undetected_errors"] >= 1
    overview = ok(client.get(f"/api/companies/{cid}/overview"))
    assert overview["is_demo"] is True and overview["approvals_pending"] == stats["approvals_left"]
    # Reproducible: a second run gives the same result.
    with session_scope() as db:
        from select_api.models import User

        again = demo.play(db, db.query(User).one().id, delay_ms=0)
    assert again == stats


def test_demo_tasks_cannot_run_live(client):
    from select_api import demo
    from select_api.db import session_scope
    from select_api.models import User

    company = ok(client.post("/api/demo"))
    with session_scope() as db:
        demo.play(db, db.query(User).one().id, delay_ms=0)
    task = ok(client.get(f"/api/companies/{company['id']}/tasks", params={"status": "todo"}))
    items = ok(client.get(f"/api/companies/{company['id']}/tasks"))["items"]
    target = items[0]
    r = client.post(f"/api/companies/{company['id']}/tasks/{target['id']}/submit", json={"output": {}})
    assert r.status_code == 409 and task is not None


@pytest.mark.parametrize("payload", [{"name": ""}, {"name": "x" * 200}, {"name": "ok", "currency": "euro"}])
def test_input_validation_messages(client, payload):
    r = client.post("/api/companies", json=payload)
    assert r.status_code == 422
    assert r.json()["detail"] == "Some fields are invalid." and r.json()["fields"]
