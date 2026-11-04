"""Starting a real company: country presets, VAT rates, templates, settings and routines."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from helpers import ok


def test_country_preset_sets_currency_vat_time_zone_and_language(client):
    presets = {c["code"]: c for c in ok(client.get("/api/countries"))}
    assert presets["FR"]["vat_rates"] == ["0.20", "0.10", "0.055", "0.021", "0"]
    assert presets["CH"]["currency"] == "CHF" and presets["FR"]["checked_on"] == "2026-11-03"

    company = ok(client.post("/api/companies", json={"name": "Menuiserie Dupont", "country": "FR"}), 201)
    assert company["currency"] == "EUR" and company["language"] == "fr" and company["timezone"] == "Europe/Paris"
    assert company["vat_rates"] == ["0.20", "0.10", "0.055", "0.021", "0"]
    cid = company["id"]

    german_rate = [{"ref": "P1", "label": "Pose", "unit": "h", "unit_price": "45.00", "vat_rate": "0.19"}]
    refused = client.put(f"/api/companies/{cid}/catalog", json=german_rate)
    assert refused.status_code == 422 and "P1 (0.19)" in refused.json()["detail"]
    french = [{"ref": "P1", "label": "Pose", "unit": "h", "unit_price": "45.00", "vat_rate": "0.20"}]
    saved = ok(client.put(f"/api/companies/{cid}/catalog", json=french))
    assert saved["catalog"][0]["vat_rate"] == "0.20"

    # A rate still used by the catalog cannot disappear.
    removed = client.patch(f"/api/companies/{cid}", json={"vat_rates": ["0.10"]})
    assert removed.status_code == 422 and "P1" in removed.json()["detail"]

    other = client.post("/api/companies", json={"name": "Elsewhere", "country": "TN"})
    assert other.status_code == 422 and "no preset" in other.json()["detail"]
    custom = ok(
        client.post(
            "/api/companies",
            json={
                "name": "Elsewhere",
                "country": "TN",
                "currency": "TND",
                "vat_rates": ["0.19"],
                "timezone": "Africa/Tunis",
            },
        ),
        201,
    )
    assert custom["vat_rates"] == ["0.19"] and custom["language"] == "en"


def test_settings_are_validated(client):
    cid = ok(client.post("/api/companies", json={"name": "Shop", "country": "BE"}), 201)["id"]
    bad = client.patch(
        f"/api/companies/{cid}",
        json={"settings": {"outbound_per_hour": 9999, "routing": {"support": "payment_request"}, "colour": "red"}},
    )
    assert bad.status_code == 422
    detail = bad.json()["detail"]
    assert "outbound_per_hour" in detail and "routing.support" in detail and "colour" in detail
    good = ok(
        client.patch(f"/api/companies/{cid}", json={"settings": {"signature": "Shop SRL — BE0123", "auto_run": False}})
    )
    assert good["settings"]["signature"].startswith("Shop SRL") and good["settings"]["auto_run"] is False
    assert good["settings"]["routing"]["quote_request"] == "quote"


def test_template_builds_a_team_in_the_company_language(client):
    templates = ok(client.get("/api/templates", params={"language": "fr"}))
    assert [t["id"] for t in templates][:3] == ["artisan", "services", "shop"]
    cid = ok(client.post("/api/companies", json={"name": "Atelier Martin", "country": "FR"}), 201)["id"]
    result = ok(
        client.post(
            f"/api/companies/{cid}/apply-template",
            json={"template": "services", "provider": "anthropic", "model": "claude-test"},
        )
    )
    assert result == {"agents": 4, "routines": 1}
    agents = {a["name"]: a for a in ok(client.get(f"/api/companies/{cid}/agents"))}
    assert set(agents) == {"Courrier", "Devis", "Service client", "Communication"}
    assert agents["Devis"]["manager_id"] == agents["Courrier"]["id"]
    assert agents["Devis"]["provider"] == "anthropic" and agents["Devis"]["connected"] is False
    [routine] = ok(client.get(f"/api/companies/{cid}/routines"))
    assert routine["enabled"] is False and routine["timezone"] == "Europe/Paris" and routine["cron"] == "0 9 * * 1"
    again = client.post(f"/api/companies/{cid}/apply-template", json={"template": "artisan"})
    assert again.status_code == 409

    changed = ok(client.post(f"/api/companies/{cid}/agents/model", json={"provider": "openai", "model": "gpt-x"}))
    assert changed == {"changed": 4}


def test_routine_creates_tasks_on_schedule(client):
    from select_api import routines, worker
    from select_api.db import session_scope
    from select_api.models import Routine

    cid = ok(client.post("/api/companies", json={"name": "Agence", "country": "FR"}), 201)["id"]
    agent = ok(
        client.post(
            f"/api/companies/{cid}/agents", json={"name": "Ana", "role": "Ops", "task_types": ["general_task"]}
        ),
        201,
    )
    too_often = client.post(
        f"/api/companies/{cid}/routines",
        json={"name": "Spam", "cron": "* * * * *", "title": "x", "task_type": "general_task"},
    )
    assert too_often.status_code == 422 and "15 minutes" in too_often.json()["detail"]
    preview = ok(client.post(f"/api/companies/{cid}/routines/preview", json={"cron": "30 8 * * 1"}))
    assert preview["valid"] and len(preview["upcoming"]) == 3
    first = datetime.fromisoformat(preview["upcoming"][0])
    assert first.astimezone(routines.ZoneInfo("Europe/Paris")).strftime("%a %H:%M") == "Mon 08:30"

    routine = ok(
        client.post(
            f"/api/companies/{cid}/routines",
            json={
                "name": "Weekly report",
                "cron": "30 8 * * 1",
                "title": "Summarise the week",
                "task_type": "general_task",
                "assignee_id": agent["id"],
            },
        ),
        201,
    )
    scheduled = datetime.fromisoformat(routine["next_run_at"])

    # Nothing is due yet.
    assert worker.tick(datetime.now(UTC))["routines"] == 0
    # The worker fires it once, even when it was down for several slots.
    assert worker.tick(scheduled + timedelta(days=15))["routines"] == 1
    tasks = ok(client.get(f"/api/companies/{cid}/tasks"))["items"]
    assert len(tasks) == 1 and tasks[0]["origin"] == "routine" and tasks[0]["assignee_name"] == "Ana"
    with session_scope() as db:
        stored = db.get(Routine, routine["id"])
        assert stored.runs_count == 1 and stored.next_run_at > scheduled + timedelta(days=15)

    run_now = ok(client.post(f"/api/companies/{cid}/routines/{routine['id']}/run"), 201)
    assert run_now["origin"] == "routine"
    ok(client.post(f"/api/companies/{cid}/emergency-stop"))
    with session_scope() as db:
        db.get(Routine, routine["id"]).next_run_at = datetime.now(UTC) - timedelta(minutes=1)
    assert worker.tick()["routines"] == 1
    assert len(ok(client.get(f"/api/companies/{cid}/tasks"))["items"]) == 2, "skipped during an emergency stop"
    skipped = ok(client.get(f"/api/companies/{cid}/activity", params={"kind": "routine.skipped"}))["items"]
    assert len(skipped) == 1


def test_free_form_task_is_always_reviewed(client):
    from helpers import submit

    cid = ok(client.post("/api/companies", json={"name": "Agence", "country": "FR"}), 201)["id"]
    ok(client.patch(f"/api/companies/{cid}", json={"policy": {"promote_after": {"supervised": 1, "sampled": 1}}}))
    agent = ok(
        client.post(
            f"/api/companies/{cid}/agents", json={"name": "Ana", "role": "Ops", "task_types": ["general_task"]}
        ),
        201,
    )
    for n in range(3):
        task = ok(
            client.post(
                f"/api/companies/{cid}/tasks",
                json={"title": f"Plan {n}", "task_type": "general_task", "assignee_id": agent["id"]},
            ),
            201,
        )
        result = submit(client, cid, task["id"], {"summary": "A plan.", "result": "1. Call the supplier."})
        assert result["status"] == "awaiting_approval"
        assert result["approvals"][-1]["reason"] == "contract_always"
        approval_id = result["approvals"][-1]["id"]
        ok(client.post(f"/api/companies/{cid}/approvals/{approval_id}/decide", json={"decision": "approved"}))
