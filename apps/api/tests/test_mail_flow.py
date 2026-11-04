"""The real e-mail loop: an IMAP mailbox is read, the message is triaged and routed, the quote is
verified and approved, and the reply leaves through SMTP exactly once.

The IMAP (pymap) and SMTP (aiosmtpd) servers are real local servers. Agent outputs are submitted
through the submission API, as an external agent runtime would; no model is called.
"""

from __future__ import annotations

import imaplib
import uuid
from email import message_from_bytes, policy
from email.message import EmailMessage
from typing import Any

import pytest
from helpers import CATALOG, good_quote, ok, s, submit

QUOTE_MAIL = "Hello, could you quote 3.2 m of oak worktop and 2 wall shelves?\nBest regards, Jonas Weber"


def run_jobs() -> None:
    from select_api import worker

    while worker.run_once("test"):
        pass


def new_folder(imap: dict[str, Any]) -> str:
    name = f"T{uuid.uuid4().hex[:10]}"
    conn = imaplib.IMAP4(imap["host"], imap["port"])
    conn.login(imap["user"], imap["password"])
    assert conn.create(name)[0] == "OK"
    conn.logout()
    return name


def drop(imap: dict[str, Any], folder: str, **headers: str) -> str:
    """Put a message in the mailbox the way a mail server would (IMAP APPEND)."""
    body = headers.pop("body", QUOTE_MAIL)
    msg = EmailMessage()
    msg["From"] = headers.pop("sender", "Jonas Weber <jonas.weber@example.org>")
    msg["To"] = "shop@example.com"
    msg["Subject"] = headers.pop("subject", "Quote for a worktop")
    msg["Message-ID"] = headers.pop("message_id", f"<{uuid.uuid4().hex}@example.org>")
    msg["Date"] = "Tue, 03 Nov 2026 09:12:00 +0100"
    for key, value in headers.items():
        msg[key.replace("_", "-")] = value
    msg.set_content(body)
    conn = imaplib.IMAP4(imap["host"], imap["port"])
    conn.login(imap["user"], imap["password"])
    assert conn.append(f'"{folder}"', None, None, msg.as_bytes())[0] == "OK"
    conn.logout()
    return str(msg["Message-ID"])


def mailbox(imap: dict[str, Any], smtp: dict[str, Any] | None, folder: str, **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "label": "Shop",
        "address": "shop@example.com",
        "display_name": "Test Atelier",
        "imap_host": imap["host"],
        "imap_port": imap["port"],
        "imap_security": "none",
        "imap_username": imap["user"],
        "imap_password": imap["password"],
        "imap_folder": folder,
        "inbound_enabled": True,
    }
    if smtp is not None:
        body |= {
            "smtp_host": smtp["host"],
            "smtp_port": smtp["port"],
            "smtp_security": "none",
            "smtp_username": "shop@example.com",
            "smtp_password": "smtp-secret",
            "outbound_enabled": True,
        }
    return body | extra


def company_with_team(client, *, policy: dict[str, Any] | None = None) -> dict[str, str]:
    cid = ok(client.post("/api/companies", json={"name": "Test Atelier", "monthly_budget": "100.00"}), 201)["id"]
    ok(client.put(f"/api/companies/{cid}/catalog", json=CATALOG))
    if policy:
        ok(client.patch(f"/api/companies/{cid}", json={"policy": policy}))

    def agent(name: str, types: list[str]) -> str:
        body = {"name": name, "role": name, "task_types": types, "permissions": ["read_messages"]}
        return ok(client.post(f"/api/companies/{cid}/agents", json=body), 201)["id"]

    return {
        "cid": cid,
        "triage": agent("Mo", ["message_triage"]),
        "sales": agent("Lea", ["quote"]),
        "support": agent("Sam", ["support_reply"]),
    }


def connect(client, team: dict[str, str], imap, smtp, folder: str) -> str:
    box = ok(client.post(f"/api/companies/{team['cid']}/mailboxes", json=mailbox(imap, smtp, folder)), 201)
    poll(client, team["cid"], box["id"])  # first read: remembers where the mailbox stands
    return str(box["id"])


def poll(client, cid: str, box_id: str) -> None:
    ok(client.post(f"/api/companies/{cid}/mailboxes/{box_id}/poll"), 202)
    run_jobs()


def messages(client, cid: str) -> list[dict[str, Any]]:
    return ok(client.get(f"/api/companies/{cid}/messages"))["items"]


def approve(client, cid: str, task_id: str, *, if_pending: bool = False) -> None:
    pending = [a for a in ok(client.get(f"/api/companies/{cid}/approvals"))["items"] if a["task_id"] == task_id]
    if not pending and if_pending:
        return
    assert pending, "expected an approval"
    ok(client.post(f"/api/companies/{cid}/approvals/{pending[0]['id']}/decide", json={"decision": "approved"}))


def newest(client, cid: str, task_type: str) -> dict[str, Any]:
    params = {"task_type": task_type, "sort": "number"}
    return ok(client.get(f"/api/companies/{cid}/tasks", params=params))["items"][0]


def source_id(client, cid: str, task_id: str) -> str:
    return ok(client.get(f"/api/companies/{cid}/tasks/{task_id}"))["inputs"]["sources"][0]["id"]


def test_full_loop_from_inbox_to_sent_reply(client, imap_server, smtp_server):
    team = company_with_team(client)
    cid = team["cid"]
    folder = new_folder(imap_server)
    drop(imap_server, folder, subject="Old message before Select")
    box_id = connect(client, team, imap_server, smtp_server, folder)
    assert messages(client, cid) == [], "mail that was already there is not answered"

    original_id = drop(imap_server, folder)
    poll(client, cid, box_id)
    [message] = messages(client, cid)
    assert message["status"] == "triage" and message["from_address"] == "jonas.weber@example.org"

    detail = ok(client.get(f"/api/companies/{cid}/messages/{message['id']}"))
    [triage] = detail["tasks"]
    assert triage["task_type"] == "message_triage" and triage["origin"] == "mail"
    source = triage["inputs"]["sources"][0]["text"]
    assert source.startswith("From: Jonas Weber <jonas.weber@example.org>") and "3.2 m of oak worktop" in source

    # The triage agent classifies; code routes the verified classification.
    submit(client, cid, triage["id"], {"category": "quote_request", "priority": "high", "summary": "Wants a quote"})
    approve(client, cid, triage["id"])
    detail = ok(client.get(f"/api/companies/{cid}/messages/{message['id']}"))
    assert detail["status"] == "routed"
    quote = next(t for t in detail["tasks"] if t["task_type"] == "quote")
    assert quote["assignee_id"] == team["sales"] and quote["parent_id"] == triage["id"]
    assert quote["priority"] == "high" and quote["origin"] == "routing"

    submit(client, cid, quote["id"], good_quote(source=source_id(client, cid, quote["id"])))
    approval = next(
        a for a in ok(client.get(f"/api/companies/{cid}/approvals"))["items"] if a["task_id"] == quote["id"]
    )
    assert approval["payload"]["email"]["subject"] == "Re: Quote for a worktop"
    assert approval["payload"]["email"]["in_reply_to"] == original_id
    approve(client, cid, quote["id"])

    run_jobs()
    catcher = smtp_server["catcher"]
    assert len(catcher.messages) == 1
    sent = message_from_bytes(catcher.messages[0], policy=policy.default)
    assert sent["To"] == "jonas.weber@example.org"
    assert sent["From"] == "Test Atelier <shop@example.com>"
    assert sent["Subject"] == "Re: Quote for a worktop"
    assert sent["In-Reply-To"] == original_id and original_id in sent["References"]
    assert sent["X-Select-Review"] == "human-approved"
    text = sent.get_content().replace("\r\n", "\n")  # SMTP carries CRLF line ends
    assert "Gesamtbetrag brutto: 873,22 €" in text
    # What was approved is what was sent.
    assert text.rstrip("\n") == "\n".join(approval["payload"]["preview"][3:])

    [delivery] = ok(client.get(f"/api/companies/{cid}/deliveries"))["items"]
    assert delivery["status"] == "sent" and delivery["message_id"] == sent["Message-ID"]
    assert ok(client.get(f"/api/companies/{cid}/messages/{message['id']}"))["status"] == "handled"

    # Never twice: the worker has nothing left, and a person cannot resend a sent e-mail.
    run_jobs()
    assert len(catcher.messages) == 1
    resend = client.post(f"/api/companies/{cid}/deliveries/{delivery['id']}/send", json={})
    assert resend.status_code == 409


def test_automatic_and_own_messages_are_never_answered(client, imap_server, smtp_server):
    team = company_with_team(client)
    cid = team["cid"]
    folder = new_folder(imap_server)
    box_id = connect(client, team, imap_server, smtp_server, folder)
    drop(imap_server, folder, subject="Out of office", Auto_Submitted="auto-replied")
    drop(imap_server, folder, subject="Our newsletter", List_Unsubscribe="<mailto:leave@example.org>")
    drop(imap_server, folder, subject="Undeliverable", sender="MAILER-DAEMON@example.org")
    drop(imap_server, folder, subject="Loop", sender="Shop <shop@example.com>")
    poll(client, cid, box_id)
    items = messages(client, cid)
    assert len(items) == 4
    assert {m["status"] for m in items} == {"ignored"}
    notes = " | ".join(m["status_note"] for m in items)
    assert "Auto-Submitted" in notes and "Newsletter" in notes and "own mailboxes" in notes and "mailer-daemon" in notes
    tasks = ok(client.get(f"/api/companies/{cid}/tasks"))["items"]
    assert tasks == []


def test_without_a_triage_agent_a_person_decides(client, imap_server):
    cid = ok(client.post("/api/companies", json={"name": "Solo"}), 201)["id"]
    folder = new_folder(imap_server)
    box = ok(client.post(f"/api/companies/{cid}/mailboxes", json=mailbox(imap_server, None, folder)), 201)
    poll(client, cid, box["id"])
    drop(imap_server, folder)
    poll(client, cid, box["id"])
    [message] = messages(client, cid)
    assert message["status"] == "needs_human"
    inbox = ok(client.get(f"/api/companies/{cid}/inbox"))
    assert inbox["counts"]["messages"] == 1
    agent = ok(
        client.post(
            f"/api/companies/{cid}/agents", json={"name": "Ana", "role": "Ops", "task_types": ["general_task"]}
        ),
        201,
    )
    task = ok(
        client.post(
            f"/api/companies/{cid}/messages/{message['id']}/task",
            json={"task_type": "general_task", "assignee_id": agent["id"]},
        ),
        201,
    )
    assert task["message_id"] == message["id"] and task["origin"] == "mail"
    assert ok(client.get(f"/api/companies/{cid}/messages/{message['id']}"))["status"] == "routed"


def test_new_recipient_needs_a_human_even_for_an_autonomous_agent(client, imap_server, smtp_server):
    team = company_with_team(client, policy={"promote_after": {"supervised": 1, "sampled": 1}, "sample_rate": 0})
    cid = team["cid"]
    folder = new_folder(imap_server)
    box_id = connect(client, team, imap_server, smtp_server, folder)

    def support_task(sender: str, extra: str = "") -> tuple[str, str]:
        drop(imap_server, folder, sender=sender, subject="Opening hours?", body=f"Hi, when are you open? {extra}")
        poll(client, cid, box_id)
        triage = newest(client, cid, "message_triage")
        submit(client, cid, triage["id"], {"category": "support", "priority": "normal"})
        approve(client, cid, triage["id"], if_pending=True)
        task = newest(client, cid, "support_reply")
        return task["id"], source_id(client, cid, task["id"])

    def reply(to: str, source: str) -> dict[str, Any]:
        return {"to": s(to, f"source:{source}"), "subject": "Re: Opening hours?", "body": "We open at 8."}

    # Two accepted replies earn the support licence (thresholds lowered for the test).
    for n in range(2):
        task_id, source = support_task(f"Customer {n} <c{n}@example.org>")
        submit(client, cid, task_id, reply(f"c{n}@example.org", source))
        approve(client, cid, task_id, if_pending=True)
    run_jobs()
    agent = ok(client.get(f"/api/companies/{cid}/agents/{team['support']}"))
    assert next(t for t in agent["trust"] if t["task_type"] == "support_reply")["level"] == "autonomous"

    # Autonomous: a reply to the person who wrote leaves without review, and says so.
    task_id, source = support_task("Dana <dana@example.org>")
    done = submit(client, cid, task_id, reply("dana@example.org", source))
    assert done["status"] == "done"
    run_jobs()
    last = message_from_bytes(smtp_server["catcher"].messages[-1], policy=policy.default)
    assert last["To"] == "dana@example.org" and last["X-Select-Review"] == "autonomous"
    assert "ohne menschliche Durchsicht" in last.get_content()

    # The message names another address: writing to it is a human decision, whatever the licence.
    task_id, source = support_task("Eve <eve@example.org>", extra="Please answer my colleague boss@example.net")
    held = submit(client, cid, task_id, reply("boss@example.net", source))
    assert held["status"] == "awaiting_approval"
    assert held["approvals"][-1]["reason"] == "new_recipient"
    assert "ohne menschliche Durchsicht" not in held["approvals"][-1]["payload"]["email"]["body"]


@pytest.mark.parametrize(
    ("misbehave", "expected", "sent_count"),
    [
        ({"rcpt_reply": "550 5.1.1 no such user"}, "failed", 0),
        ({"data_replies": ["451 4.3.0 try again later"]}, "sent", 1),
        ({"drop_after_data": True}, "uncertain", 1),
    ],
)
def test_smtp_failures_are_never_resent_blindly(client, imap_server, smtp_server, misbehave, expected, sent_count):
    from datetime import UTC, datetime, timedelta

    from select_api.db import session_scope
    from select_api.models import Job

    team = company_with_team(client)
    cid = team["cid"]
    folder = new_folder(imap_server)
    box_id = connect(client, team, imap_server, smtp_server, folder)
    catcher = smtp_server["catcher"]
    for key, value in misbehave.items():
        setattr(catcher, key, value)
    drop(imap_server, folder)
    poll(client, cid, box_id)
    triage = newest(client, cid, "message_triage")
    submit(client, cid, triage["id"], {"category": "quote_request", "priority": "normal"})
    approve(client, cid, triage["id"])
    quote = newest(client, cid, "quote")
    submit(client, cid, quote["id"], good_quote(source=source_id(client, cid, quote["id"])))
    approve(client, cid, quote["id"])
    run_jobs()
    if misbehave.get("data_replies") is not None:
        # The retry waits a little; make it due now instead of sleeping.
        with session_scope() as db:
            for job in db.query(Job).filter(Job.kind == "deliver_email", Job.status == "queued"):
                job.run_after = datetime.now(UTC) - timedelta(seconds=1)
        run_jobs()
    [delivery] = ok(client.get(f"/api/companies/{cid}/deliveries"))["items"]
    assert delivery["status"] == expected, delivery
    assert len(catcher.messages) == sent_count
    run_jobs()
    assert len(catcher.messages) == sent_count, "nothing is sent again by itself"
    if expected == "uncertain":
        refused = client.post(f"/api/companies/{cid}/deliveries/{delivery['id']}/send", json={})
        assert refused.status_code == 409 and "Sent folder" in refused.json()["detail"]
        marked = ok(client.post(f"/api/companies/{cid}/deliveries/{delivery['id']}/mark", json={"status": "sent"}))
        assert marked["status"] == "sent"
    if expected == "failed":
        assert "550" in delivery["last_error"]
        catcher.rcpt_reply = None
        ok(client.post(f"/api/companies/{cid}/deliveries/{delivery['id']}/send", json={}))
        run_jobs()
        assert len(catcher.messages) == 1


def test_hourly_limit_and_emergency_stop_hold_mail(client, imap_server, smtp_server):
    team = company_with_team(client)
    cid = team["cid"]
    ok(client.patch(f"/api/companies/{cid}", json={"settings": {"outbound_per_hour": 1}}))
    folder = new_folder(imap_server)
    box_id = connect(client, team, imap_server, smtp_server, folder)

    def quote_round(subject: str) -> None:
        drop(imap_server, folder, subject=subject)
        poll(client, cid, box_id)
        triage = newest(client, cid, "message_triage")
        submit(client, cid, triage["id"], {"category": "quote_request", "priority": "normal"})
        approve(client, cid, triage["id"])
        quote = newest(client, cid, "quote")
        submit(client, cid, quote["id"], good_quote(source=source_id(client, cid, quote["id"])))
        approve(client, cid, quote["id"])

    quote_round("First")
    run_jobs()
    quote_round("Second")
    held = ok(client.get(f"/api/companies/{cid}/deliveries", params={"status": "held"}))["items"]
    assert len(held) == 1 and "Hourly limit of 1" in held[0]["status_note"]
    assert ok(client.get(f"/api/companies/{cid}/inbox"))["counts"]["deliveries"] == 1

    ok(client.post(f"/api/companies/{cid}/emergency-stop"))
    refused = client.post(f"/api/companies/{cid}/deliveries/{held[0]['id']}/send", json={})
    assert refused.status_code == 409 and "emergency stop" in refused.json()["detail"]
    ok(client.post(f"/api/companies/{cid}/emergency-stop", params={"on": False}))
    ok(client.post(f"/api/companies/{cid}/deliveries/{held[0]['id']}/send", json={}))
    run_jobs()
    assert len(smtp_server["catcher"].messages) == 2


def test_without_an_outgoing_mailbox_mail_waits_ready(client, imap_server, smtp_server):
    team = company_with_team(client)
    cid = team["cid"]
    folder = new_folder(imap_server)
    box_id = connect(client, team, imap_server, None, folder)
    drop(imap_server, folder)
    poll(client, cid, box_id)
    triage = newest(client, cid, "message_triage")
    submit(client, cid, triage["id"], {"category": "quote_request", "priority": "normal"})
    approve(client, cid, triage["id"])
    quote = newest(client, cid, "quote")
    submit(client, cid, quote["id"], good_quote(source=source_id(client, cid, quote["id"])))
    approve(client, cid, quote["id"])
    [delivery] = ok(client.get(f"/api/companies/{cid}/deliveries"))["items"]
    assert delivery["status"] == "ready" and "No outgoing mailbox" in delivery["status_note"]

    ok(client.put(f"/api/companies/{cid}/mailboxes/{box_id}", json=mailbox(imap_server, smtp_server, folder)))
    ok(client.post(f"/api/companies/{cid}/deliveries/{delivery['id']}/send", json={}))
    run_jobs()
    assert len(smtp_server["catcher"].messages) == 1


def test_mailbox_test_reports_and_never_returns_passwords(client, imap_server, smtp_server):
    team = company_with_team(client)
    cid = team["cid"]
    folder = new_folder(imap_server)
    box = ok(client.post(f"/api/companies/{cid}/mailboxes", json=mailbox(imap_server, smtp_server, folder)), 201)
    assert "imap_password" not in box and box["has_imap_password"] and box["has_smtp_password"]
    result = ok(client.post(f"/api/companies/{cid}/mailboxes/{box['id']}/test"))
    assert result["imap"]["ok"] and result["smtp"]["ok"] and "nothing was sent" in result["smtp"]["detail"]
    assert smtp_server["catcher"].messages == []

    wrong = mailbox(imap_server, smtp_server, folder, imap_password="wrong", smtp_password="wrong")
    ok(client.put(f"/api/companies/{cid}/mailboxes/{box['id']}", json=wrong))
    result = ok(client.post(f"/api/companies/{cid}/mailboxes/{box['id']}/test"))
    assert not result["imap"]["ok"] and "login refused" in result["imap"]["detail"]
    assert not result["smtp"]["ok"] and "login refused" in result["smtp"]["detail"]

    # A failing mailbox is reported once in the activity log, not on every poll.
    poll(client, cid, box["id"])
    poll(client, cid, box["id"])
    [state] = ok(client.get(f"/api/companies/{cid}/mailboxes"))
    assert state["last_poll_ok"] is False and "login refused" in state["last_poll_error"]
    failures = ok(client.get(f"/api/companies/{cid}/activity", params={"kind": "mail.poll_failed"}))["items"]
    assert len(failures) == 1
