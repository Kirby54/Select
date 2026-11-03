"""Demo mode: a recorded, reproducible week in a fictional workshop. No model is called.

Every task goes through the real pipeline: select-verify checks, receipts, approvals and the
autonomy engine all run for real. Only the agents' outputs are recorded in advance, and every
row created here is flagged is_demo so it is never mistaken for live work.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from . import autonomy
from .audit import record
from .auth import Actor
from .config import get_settings
from .contracts import catalog_items
from .models import (
    Agent,
    Approval,
    AuditEvent,
    Company,
    CostEvent,
    Membership,
    Outcome,
    ReceiptRow,
    Run,
    Task,
    TaskComment,
    TrustEvent,
)
from .pipeline import decide, new_run, process_output, report_problem
from .quote_pack import build_quote

DEMO_NS = uuid.UUID("6f1c7a52-2d0e-4c8e-9b55-0c2a1d1e5e10")
DEMO_ACTOR = Actor("demo", "demo-reviewer", "Demo reviewer")


@lru_cache
def spec() -> dict[str, Any]:
    path = get_settings().packs_dir / "demo" / "atelier.json"
    return json.loads(path.read_text(encoding="utf-8"))


def demo_company_id(user_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, f"company:{user_id}")


def _sourced(value: str, ref: str) -> dict[str, str]:
    return {"value": value, "source_ref": ref}


def setup(db: Session, user_id: uuid.UUID) -> Company:
    cid = demo_company_id(user_id)
    company = db.get(Company, cid)
    if company is not None:
        return company
    s = spec()
    company = Company(
        id=cid,
        name=s["company"]["name"],
        slug=f"demo-{str(user_id)[:8]}",
        currency=s["company"]["currency"],
        monthly_budget=Decimal(s["company"]["monthly_budget"]),
        is_demo=True,
        policy=s["company"]["policy"],
        catalog=s["catalog"],
    )
    db.add(company)
    db.flush()
    db.add(Membership(company_id=cid, user_id=user_id, role="owner"))
    by_key: dict[str, Agent] = {}
    for position, a in enumerate(s["agents"]):
        agent = Agent(
            id=uuid.uuid5(DEMO_NS, f"agent:{user_id}:{a['key']}"),
            company_id=cid,
            name=a["name"],
            role=a["role"],
            description=a["description"],
            task_types=a["task_types"],
            permissions=["read_messages", "draft_external"],
            manager_id=by_key[a["manager"]].id if a["manager"] else None,
            position=position,
            config={"demo_key": a["key"]},
        )
        db.add(agent)
        db.flush()
        by_key[a["key"]] = agent
    record(db, cid, DEMO_ACTOR, "company.created", "company", cid, "Demo company created", is_demo=True)
    db.commit()
    return company


def reset(db: Session, user_id: uuid.UUID) -> Company:
    db.execute(delete(Company).where(Company.id == demo_company_id(user_id)))
    db.commit()
    return setup(db, user_id)


@dataclass
class Event:
    day: int
    agent: str
    task_type: str
    title: str
    sources: list[dict[str, str]]
    output: dict[str, Any] | None = None
    extraction: dict[str, Any] | None = None
    correction: dict[str, Any] | None = None
    decision: tuple[str, str] | None = ("approved", "")
    report: str | None = None
    note: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


def _request_text(customer: dict[str, str], items: list[list[str]], number: int) -> str:
    wanted = " and ".join(
        f"{qty} {unit_word}" if unit != "m" else f"{qty} m of {unit_word}" for _ref, unit_word, qty, unit in items
    )
    return (
        f"From: {customer['name']} <{customer['email']}>\nSubject: Request #{number}\n\n"
        f"Hello, this is {customer['name']}. Could you send me a quote for {wanted}?\n"
        f"Best regards, {customer['name']}"
    )


def events() -> list[Event]:
    s = spec()
    out: list[Event] = []
    customers, requests, questions = s["customers"], s["quote_requests"], s["support_questions"]
    q = 0
    for day in range(1, 8):
        # Two incoming messages triaged by the operations lead.
        for i in range(2):
            c = customers[(day + i) % len(customers)]
            sid = f"d{day}-in{i}"
            text = f"From: {c['name']} <{c['email']}>\n\nHello, {questions[(day + i) % len(questions)]}"
            out.append(
                Event(
                    day,
                    "ops",
                    "message_triage",
                    f"Triage message from {c['name']}",
                    [{"id": sid, "text": text}],
                    output={"category": "support", "priority": "normal"},
                )
            )
        # Three quotes by Lea.
        for i in range(3):
            c = customers[q % len(customers)]
            req = requests[q % len(requests)]
            sid = f"d{day}-req{i}"
            text = _request_text(c, req["items"], q + 100)
            extraction = {
                "customer": {
                    "name": _sourced(c["name"], f"source:{sid}"),
                    "email": _sourced(c["email"], f"source:{sid}"),
                },
                "items": [
                    {"catalog_ref": ref, "quantity": _sourced(qty, f"source:{sid}")}
                    for ref, _w, qty, _u in req["items"]
                ],
                "missing": [],
            }
            event = Event(
                day, "sales", "quote", f"Quote for {c['name']}", [{"id": sid, "text": text}], extraction=extraction
            )
            if day == 5 and i == 1:
                wrong = json.loads(json.dumps(extraction))
                wrong["items"][0]["quantity"]["value"] = "7"  # not in the e-mail
                event.correction = extraction
                event.extraction = wrong
                event.note = "injected error: quantity 7 does not appear in the customer's e-mail"
            out.append(event)
            q += 1
        # Two support replies by Sam.
        for i in range(2):
            c = customers[(day * 2 + i) % len(customers)]
            sid = f"d{day}-sup{i}"
            question = questions[(day * 2 + i) % len(questions)]
            text = f"From: {c['name']} <{c['email']}>\n\nHello, {question}"
            reply = {
                "to": _sourced(c["email"], f"source:{sid}"),
                "subject": "Re: your message",
                "body": f"Hello {c['name'].split()[0]},\n\nthank you for your message. We will look at it and "
                "get back to you with a concrete proposal.\n\nAtelier Holzwerk",
            }
            event = Event(
                day, "support", "support_reply", f"Reply to {c['name']}", [{"id": sid, "text": text}], output=reply
            )
            if day == 3 and i == 0:
                bad = dict(reply, body=reply["body"] + "\nOf course you get a full refund.")
                event.correction, event.output = reply, bad
                event.note = "injected error: the reply promises a refund"
            if day == 6 and i == 1:
                event.report = "The customer asked for a date; the reply gave none."
            out.append(event)
        if day in (2, 4, 6):
            post = {
                "channel": "linkedin",
                "figures": [],
                "text": (
                    "Fresh from the workshop: a solid oak dining table, oiled by hand, "
                    "now at home with a family in Ehrenfeld."
                ),
            }
            out.append(Event(day, "comms", "social_post", "Post about a finished table", [], output=post))
        if day in (3, 5):
            c = customers[day % len(customers)]
            req = requests[day % len(requests)]
            sid = f"d{day}-order"
            text = _request_text(c, req["items"], 900 + day) + "\n\nOrder confirmed."
            extraction = {
                "customer": {
                    "name": _sourced(c["name"], f"source:{sid}"),
                    "email": _sourced(c["email"], f"source:{sid}"),
                },
                "items": [
                    {"catalog_ref": ref, "quantity": _sourced(qty, f"source:{sid}")}
                    for ref, _w, qty, _u in req["items"]
                ],
            }
            out.append(
                Event(
                    day,
                    "accounting",
                    "invoice_draft",
                    f"Invoice draft for {c['name']}",
                    [{"id": sid, "text": text}],
                    extraction=extraction,
                    extra={"invoice_number": f"RE-2026-{day:04d}"},
                )
            )
        if day == 6:
            sid = "d6-supplier"
            text = (
                "Invoice 2026-118 from Holzhandel Rhein GmbH\n12 oak boards, 27 mm\nTotal due: 1284.60 EUR\n"
                "Bank account ending 4417"
            )
            payment = {
                "payee": "Holzhandel Rhein GmbH",
                "iban_last4": "4417",
                "amount": _sourced("1284.60", f"source:{sid}"),
                "reference": "Invoice 2026-118",
            }
            out.append(
                Event(
                    day,
                    "accounting",
                    "payment_request",
                    "Pay supplier invoice 2026-118",
                    [{"id": sid, "text": text}],
                    output=payment,
                )
            )
    for event in out:
        if event.day == 7:
            event.decision = None  # left in the approval queue for you to decide
    return out


def _deliverable(
    company: Company, event: Event, extraction: dict[str, Any] | None, output: dict[str, Any] | None
) -> dict[str, Any]:
    if event.task_type in ("quote", "invoice_draft"):
        quote = build_quote(extraction or {}, catalog_items(company))
        if event.task_type == "invoice_draft":
            quote["invoice_number"] = event.extra["invoice_number"]
        return quote
    return dict(output or {})


def _next_number(db: Session, company_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.coalesce(func.max(Task.number), 0)).where(Task.company_id == company_id))) + 1


def play(db: Session, user_id: uuid.UUID, progress: Any = None, *, delay_ms: int | None = None) -> dict[str, int]:
    """Replay the week. ``progress(done, total, day)`` is called after each event."""
    company = reset(db, user_id)
    agents = {a.config.get("demo_key"): a for a in db.scalars(select(Agent).where(Agent.company_id == company.id))}
    delay = (get_settings().demo_step_delay_ms if delay_ms is None else delay_ms) / 1000
    plan = events()
    stats = {"tasks": 0, "corrections": 0, "approvals_left": 0}
    now = datetime.now(UTC)
    per_day: dict[int, int] = {}
    for index, event in enumerate(plan):
        real_start = datetime.now(UTC)
        slot = per_day[event.day] = per_day.get(event.day, -1) + 1
        simulated = now - timedelta(days=7 - event.day, hours=9) + timedelta(minutes=18 * slot)
        agent = agents[event.agent]
        task = Task(
            id=uuid.uuid5(DEMO_NS, f"task:{user_id}:{index}"),
            company_id=company.id,
            number=_next_number(db, company.id),
            title=event.title,
            description=event.note,
            task_type=event.task_type,
            assignee_id=agent.id,
            status="in_progress",
            priority="medium",
            inputs={"sources": event.sources, "demo_day": event.day},
            is_demo=True,
            created_by="demo",
        )
        db.add(task)
        db.flush()
        record(
            db,
            company.id,
            DEMO_ACTOR,
            "task.created",
            "task",
            task.id,
            f"Day {event.day}: T-{task.number} {event.title} → {agent.name}",
            is_demo=True,
        )
        actor = Actor("demo", str(agent.id), agent.name)
        run = new_run(db, task, "demo")
        result = process_output(db, task, run, _deliverable(company, event, event.extraction, event.output), actor)
        # Recorded tokens make the cost page meaningful; they are flagged as demo, never billed.
        db.add(
            CostEvent(
                company_id=company.id,
                agent_id=agent.id,
                task_id=task.id,
                run_id=run.id,
                provider="demo",
                model="recorded",
                input_tokens=1200,
                output_tokens=300,
                amount=Decimal("0.0081"),
                kind="estimated",
                is_demo=True,
            )
        )
        if result.status == "needs_correction" and (event.correction is not None):
            stats["corrections"] += 1
            run = new_run(db, task, "demo")
            fixed_output = event.output if event.task_type not in ("quote", "invoice_draft") else None
            if event.task_type == "support_reply":
                fixed_output = event.correction
            result = process_output(db, task, run, _deliverable(company, event, event.correction, fixed_output), actor)
        if result.status == "awaiting_approval" and result.approval is not None:
            if event.decision is not None:
                decide(db, result.approval, event.decision[0], event.decision[1], DEMO_ACTOR)
            else:
                stats["approvals_left"] += 1
        if event.report and task.status == "done":
            report_problem(db, task, event.report, DEMO_ACTOR)
        stats["tasks"] += 1
        _backdate(db, company.id, task.id, real_start, simulated)
        db.commit()
        if progress is not None:
            progress(index + 1, len(plan), event.day)
        if delay:
            time.sleep(delay)
    record(
        db,
        company.id,
        DEMO_ACTOR,
        "demo.finished",
        "company",
        company.id,
        f"Demo week finished: {stats['tasks']} tasks, {stats['corrections']} corrections, "
        f"{stats['approvals_left']} approvals waiting for you",
        stats,
        is_demo=True,
    )
    db.commit()
    return stats


def _backdate(db: Session, company_id: uuid.UUID, task_id: uuid.UUID, since: datetime, when: datetime) -> None:
    """Spread the recorded week over seven simulated days.

    Only rows of the demo company created during this event are touched, never live data.
    """
    for model in (Task, Run, ReceiptRow, Approval, Outcome, TrustEvent, AuditEvent, CostEvent):
        db.execute(
            update(model).where(model.company_id == company_id, model.created_at >= since).values(created_at=when)
        )
    db.execute(update(Task).where(Task.id == task_id).values(updated_at=when))
    db.execute(update(Run).where(Run.task_id == task_id).values(started_at=when, finished_at=when))
    db.execute(
        update(Approval).where(Approval.task_id == task_id, Approval.decided_at.is_not(None)).values(decided_at=when)
    )
    db.execute(update(TaskComment).where(TaskComment.task_id == task_id).values(created_at=when))


def summary_counts(db: Session, company_id: uuid.UUID) -> dict[str, int]:
    return autonomy.level_counts(db, company_id)
