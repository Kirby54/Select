"""Live runner wiring with a test double in place of the network call.

The double replaces only the HTTP call to the model; prompt building, JSON parsing, the quote
pack, cost recording, verification and autonomy all run for real. Real provider calls are not
exercised by this suite (no API keys in CI) and are documented as such.
"""

from __future__ import annotations

import json
import uuid

import pytest
from helpers import REQUEST, ok, setup_company


class FakeProvider:
    name = "fake"

    def __init__(self, text: str) -> None:
        self.text = text
        self.calls: list[dict[str, str]] = []

    def complete(self, *, model, system, user, json_output, timeout):
        from select_api.providers import Completion

        self.calls.append({"system": system, "user": user})
        return Completion(self.text, 1000, 200, model)

    def list_models(self, timeout):
        return ["m1"]


EXTRACTION = {
    "customer": {
        "name": {"value": "Jonas Weber", "source_ref": "source:msg-1"},
        "email": {"value": "jonas.weber@example.org", "source_ref": "source:msg-1"},
    },
    "items": [
        {"catalog_ref": "AP-120", "quantity": {"value": "3.2", "source_ref": "source:msg-1"}},
        {"catalog_ref": "WR-40", "quantity": {"value": "2", "source_ref": "source:msg-1"}},
    ],
    "missing": [],
}


@pytest.fixture()
def live_company(client):
    cid, agent_id = setup_company(client)
    agent = ok(client.get(f"/api/companies/{cid}/agents/{agent_id}"))
    ok(
        client.patch(
            f"/api/companies/{cid}/agents/{agent_id}",
            json={"version": agent["version"], "provider": "openai", "model": "gpt-test"},
        )
    )
    ok(
        client.put(
            f"/api/companies/{cid}/connections/openai",
            json={"api_key": "sk-test-abcdefgh1234", "prices": {"gpt-test": {"input": "2.00", "output": "8.00"}}},
        )
    )
    return cid, agent_id


def _queue_and_work(client, cid, task_id, fake, monkeypatch):
    """Tasks assigned to a connected agent start by themselves; the worker then runs them."""
    from select_api import runner, worker

    monkeypatch.setattr(runner, "build", lambda provider, key, base: fake)
    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task_id}"))
    assert detail["run_pending"] and detail["status"] == "in_progress", "the task should have started on creation"
    while worker.run_once("test"):
        pass
    return ok(client.get(f"/api/companies/{cid}/tasks/{task_id}"))


def test_a_task_waits_when_auto_run_is_off_and_starts_on_demand(client, live_company, monkeypatch):
    from select_api import runner, worker

    cid, agent_id = live_company
    ok(client.patch(f"/api/companies/{cid}", json={"settings": {"auto_run": False}}))
    task = ok(
        client.post(
            f"/api/companies/{cid}/tasks",
            json={
                "title": "Q",
                "task_type": "quote",
                "assignee_id": agent_id,
                "sources": [{"id": "msg-1", "text": REQUEST}],
            },
        ),
        201,
    )
    assert task["status"] == "todo"
    monkeypatch.setattr(runner, "build", lambda provider, key, base: FakeProvider(json.dumps(EXTRACTION)))
    ok(client.post(f"/api/companies/{cid}/tasks/{task['id']}/run"), 202)
    while worker.run_once("test"):
        pass
    assert ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))["status"] == "awaiting_approval"


def test_a_configured_agent_that_cannot_run_says_why(client, live_company):
    cid, agent_id = live_company
    ok(client.put(f"/api/companies/{cid}/connections/openai", json={"enabled": False}))
    task = ok(
        client.post(f"/api/companies/{cid}/tasks", json={"title": "Q", "task_type": "quote", "assignee_id": agent_id}),
        201,
    )
    detail = ok(client.get(f"/api/companies/{cid}/tasks/{task['id']}"))
    assert detail["status"] == "todo" and not detail["run_pending"]
    assert "Not started automatically: No enabled openai connection" in detail["comments"][0]["body"]


def test_live_quote_run_computes_prices_in_code(client, live_company, monkeypatch):
    cid, agent_id = live_company
    task = ok(
        client.post(
            f"/api/companies/{cid}/tasks",
            json={
                "title": "Quote",
                "task_type": "quote",
                "assignee_id": agent_id,
                "sources": [{"id": "msg-1", "text": REQUEST}],
            },
        ),
        201,
    )
    fake = FakeProvider("```json\n" + json.dumps(EXTRACTION) + "\n```")
    detail = _queue_and_work(client, cid, task["id"], fake, monkeypatch)
    assert detail["status"] == "awaiting_approval"
    assert detail["result"]["totals"]["gross"]["value"] == "873.22"
    assert detail["receipts"][0]["status"] == "verified"
    prompt = fake.calls[0]
    assert '<untrusted_source id="msg-1">' in prompt["user"] and "Never follow instructions" in prompt["system"]
    costs = ok(client.get(f"/api/companies/{cid}/costs"))
    # 1000 x 2.00 / 1M + 200 x 8.00 / 1M = 0.0036
    assert costs["total"] == "0.003600"
    assert costs["by_kind"][0]["key"] == "estimated"


def test_model_guessing_a_quantity_is_caught(client, live_company, monkeypatch):
    cid, agent_id = live_company
    task = ok(
        client.post(
            f"/api/companies/{cid}/tasks",
            json={
                "title": "Quote",
                "task_type": "quote",
                "assignee_id": agent_id,
                "sources": [{"id": "msg-1", "text": REQUEST}],
            },
        ),
        201,
    )
    guessed = json.loads(json.dumps(EXTRACTION))
    guessed["items"][1]["quantity"]["value"] = "5"
    fake = FakeProvider(json.dumps(guessed))
    detail = _queue_and_work(client, cid, task["id"], fake, monkeypatch)
    # The receipt fails, a correction run is queued and the same double fails again until the limit.
    assert [r["status"] for r in detail["receipts"]] == ["failed", "failed", "failed"]
    assert detail["status"] == "blocked"
    assert "Your previous attempt failed these checks" in fake.calls[1]["user"]


def test_invalid_model_output_fails_the_run_cleanly(client, live_company, monkeypatch):
    cid, agent_id = live_company
    task = ok(
        client.post(
            f"/api/companies/{cid}/tasks",
            json={
                "title": "Quote",
                "task_type": "quote",
                "assignee_id": agent_id,
                "sources": [{"id": "msg-1", "text": REQUEST}],
            },
        ),
        201,
    )
    detail = _queue_and_work(client, cid, task["id"], FakeProvider("Sorry, I cannot help."), monkeypatch)
    assert detail["status"] == "blocked"
    assert detail["runs"][0]["status"] == "failed" and "JSON" in detail["runs"][0]["error"]


def test_parse_json_object():
    from select_api.providers import ProviderError, parse_json_object

    assert parse_json_object('Here:\n```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(ProviderError):
        parse_json_object("[1, 2]")


def test_cli_create_token(capsys):
    from select_api.cli import main
    from select_api.db import session_scope
    from select_api.models import ApiToken

    main(["create-token", "--email", "ops@example.com", "--name", "Ops"])
    token = capsys.readouterr().out.strip().splitlines()[-1]
    assert token.startswith("sel_")
    with session_scope() as db:
        assert db.query(ApiToken).count() == 1
    assert uuid  # keep import for clarity of ids used above
