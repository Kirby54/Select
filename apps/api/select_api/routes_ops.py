"""Company setup helpers, mailboxes, incoming messages, outgoing e-mails and routines."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from . import automation, delivery, jobs, routines, templates
from .audit import record
from .auth import CompanyDep, DbDep, PrincipalDep
from .company_profile import presets
from .contracts import get_contract
from .mail import MailError, SendDeferred, SendRejected, Server, imap_test, smtp_test
from .models import Agent, Delivery, MailAccount, MailMessage, Routine, Task
from .security import SecretError, decrypt, encrypt
from .views import (
    AgentsModelIn,
    ApplyTemplateIn,
    DeliveryMarkIn,
    DeliverySendIn,
    MailboxIn,
    MessageTaskIn,
    NoteIn,
    RoutineIn,
    RoutinePatch,
    SchedulePreviewIn,
    delivery_out,
    iso,
    mailbox_out,
    message_out,
    routine_out,
    task_out,
)

router = APIRouter(prefix="/api")


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- setup helpers


@router.get("/countries")
def countries() -> list[dict[str, Any]]:
    return presets()


@router.get("/templates")
def list_templates(principal: PrincipalDep, language: str = Query(default="en", pattern="^(fr|de|en)$")) -> Any:
    return templates.summary(language)


@router.post("/companies/{company_id}/apply-template")
def apply_template(body: ApplyTemplateIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    if ctx.company.is_demo:
        raise HTTPException(status.HTTP_409_CONFLICT, "The demo company keeps its recorded team.")
    try:
        result = templates.apply(
            db, ctx.company, body.template, ctx.principal.actor, provider=body.provider, model=body.model
        )
    except templates.TemplateError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.commit()
    return result


@router.post("/companies/{company_id}/agents/model")
def set_agents_model(body: AgentsModelIn, ctx: CompanyDep, db: DbDep) -> dict[str, int]:
    """Give every active agent (or only those without one) the same provider and model."""
    ctx.require("admin")
    changed = 0
    for agent in db.scalars(select(Agent).where(Agent.company_id == ctx.company.id, Agent.status != "archived")):
        if body.only_unset and agent.provider and agent.model:
            continue
        if (agent.provider, agent.model) != (body.provider, body.model):
            agent.provider, agent.model = body.provider, body.model
            agent.version += 1
            changed += 1
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "agent.updated",
        "company",
        ctx.company.id,
        f"{changed} agent(s) now use {body.provider}/{body.model}",
    )
    db.commit()
    return {"changed": changed}


# ---------------------------------------------------------------- mailboxes


def _mailbox(db: DbDep, company_id: uuid.UUID, mailbox_id: uuid.UUID, *, lock: bool = False) -> MailAccount:
    query = select(MailAccount).where(MailAccount.id == mailbox_id, MailAccount.company_id == company_id)
    account = db.scalar(query.with_for_update() if lock else query)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mailbox not found.")
    return account


def _apply_mailbox(account: MailAccount, body: MailboxIn) -> None:
    data = body.model_dump(exclude={"imap_password", "smtp_password"})
    data["address"] = data["address"].strip().lower()
    reading_changed = any(
        getattr(account, key, None) != data[key] for key in ("imap_host", "imap_port", "imap_username", "imap_folder")
    )
    for key, value in data.items():
        setattr(account, key, value)
    if body.imap_password:
        account.imap_password_encrypted = encrypt(body.imap_password)
    if body.smtp_password:
        account.smtp_password_encrypted = encrypt(body.smtp_password)
    if reading_changed:
        # Another server or folder: read new mail from the moment it is connected.
        account.imap_uidvalidity = account.imap_last_uid = None
    if body.inbound_enabled and not (account.imap_host and account.imap_username and account.imap_password_encrypted):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "To read mail, give the IMAP server, user name and password."
        )
    if body.outbound_enabled and not account.smtp_host:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "To send mail, give the SMTP server.")
    if body.outbound_enabled and account.smtp_username and not account.smtp_password_encrypted:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give the SMTP password, or leave the user empty.")


@router.get("/companies/{company_id}/mailboxes")
def list_mailboxes(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(MailAccount).where(MailAccount.company_id == ctx.company.id).order_by(MailAccount.created_at)
    ).all()
    return [mailbox_out(m) for m in rows]


@router.post("/companies/{company_id}/mailboxes", status_code=201)
def create_mailbox(body: MailboxIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    if ctx.company.is_demo:
        raise HTTPException(status.HTTP_409_CONFLICT, "The demo company cannot read or send real e-mail.")
    if db.scalar(
        select(MailAccount.id).where(
            MailAccount.company_id == ctx.company.id, MailAccount.address == body.address.strip().lower()
        )
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "This address is already connected.")
    account = MailAccount(company_id=ctx.company.id)
    _apply_mailbox(account, body)
    db.add(account)
    db.flush()
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "mailbox.created",
        "mailbox",
        account.id,
        f"Mailbox {account.address} added (reading {'on' if account.inbound_enabled else 'off'}, "
        f"sending {'on' if account.outbound_enabled else 'off'})",
    )
    db.commit()
    return mailbox_out(account)


@router.put("/companies/{company_id}/mailboxes/{mailbox_id}")
def update_mailbox(mailbox_id: uuid.UUID, body: MailboxIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    account = _mailbox(db, ctx.company.id, mailbox_id, lock=True)
    _apply_mailbox(account, body)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "mailbox.updated",
        "mailbox",
        account.id,
        f"Mailbox {account.address} saved (reading {'on' if account.inbound_enabled else 'off'}, "
        f"sending {'on' if account.outbound_enabled else 'off'})",
    )
    db.commit()
    return mailbox_out(account)


@router.delete("/companies/{company_id}/mailboxes/{mailbox_id}")
def delete_mailbox(mailbox_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, str]:
    ctx.require("admin")
    account = _mailbox(db, ctx.company.id, mailbox_id, lock=True)
    address = account.address
    db.delete(account)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "mailbox.deleted",
        "mailbox",
        mailbox_id,
        f"Mailbox {address} removed; its passwords were erased, received messages are kept",
    )
    db.commit()
    return {"status": "deleted"}


@router.post("/companies/{company_id}/mailboxes/{mailbox_id}/test")
def test_mailbox(mailbox_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    """Logs in to IMAP and SMTP. Reads nothing, sends nothing."""
    ctx.require("admin")
    account = _mailbox(db, ctx.company.id, mailbox_id, lock=True)
    out: dict[str, Any] = {"imap": None, "smtp": None}
    if account.imap_host:
        try:
            password = decrypt(account.imap_password_encrypted) if account.imap_password_encrypted else None
            info = imap_test(
                Server(account.imap_host, account.imap_port, account.imap_security, account.imap_username, password),
                account.imap_folder,
            )
            out["imap"] = {"ok": True, "detail": f"{info['messages']} message(s) in {info['folder']}"}
        except (MailError, SecretError) as exc:
            out["imap"] = {"ok": False, "detail": str(exc)}
    if account.smtp_host:
        account.last_smtp_test_at = _now()
        try:
            password = decrypt(account.smtp_password_encrypted) if account.smtp_password_encrypted else None
            smtp_test(
                Server(account.smtp_host, account.smtp_port, account.smtp_security, account.smtp_username, password)
            )
            account.last_smtp_test_ok, account.last_smtp_error = True, None
            out["smtp"] = {"ok": True, "detail": "signed in; nothing was sent"}
        except (SendDeferred, SendRejected, SecretError) as exc:
            account.last_smtp_test_ok, account.last_smtp_error = False, str(exc)[:1000]
            out["smtp"] = {"ok": False, "detail": str(exc)}
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "mailbox.tested",
        "mailbox",
        account.id,
        f"{account.address}: IMAP {_verdict(out['imap'])}, SMTP {_verdict(out['smtp'])}",
    )
    db.commit()
    return {**out, "mailbox": mailbox_out(account)}


def _verdict(result: dict[str, Any] | None) -> str:
    return "not set" if result is None else ("ok" if result["ok"] else "failed")


@router.post("/companies/{company_id}/mailboxes/{mailbox_id}/poll", status_code=202)
def poll_now(mailbox_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    account = _mailbox(db, ctx.company.id, mailbox_id)
    if not account.inbound_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reading is off for this mailbox.")
    if jobs.pending(db, "mail_poll", "account_id", str(account.id)):
        return {"status": "already queued"}
    job = jobs.enqueue(db, "mail_poll", {"account_id": str(account.id)}, company_id=ctx.company.id, max_attempts=1)
    db.commit()
    return {"status": "queued", "job_id": str(job.id)}


# ---------------------------------------------------------------- messages


@router.get("/companies/{company_id}/messages")
def list_messages(
    ctx: CompanyDep,
    db: DbDep,
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(open|new|triage|routed|needs_human|handled|ignored|failed)$"
    ),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    query = select(MailMessage).where(MailMessage.company_id == ctx.company.id)
    if status_filter == "open":
        query = query.where(MailMessage.status.in_(("new", "triage", "routed", "needs_human", "failed")))
    elif status_filter:
        query = query.where(MailMessage.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                MailMessage.subject.ilike(like), MailMessage.from_address.ilike(like), MailMessage.from_name.ilike(like)
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(MailMessage.received_at.desc()).limit(limit).offset(offset)).all()
    boxes = {m.id: m for m in db.scalars(select(MailAccount).where(MailAccount.company_id == ctx.company.id))}
    counts = dict(
        db.execute(
            select(MailMessage.status, func.count())
            .where(MailMessage.company_id == ctx.company.id)
            .group_by(MailMessage.status)
        ).all()
    )
    return {
        "items": [message_out(m, boxes.get(m.mail_account_id) if m.mail_account_id else None) for m in rows],
        "total": total,
        "counts": counts,
    }


def _message(db: DbDep, company_id: uuid.UUID, message_id: uuid.UUID) -> MailMessage:
    message = db.get(MailMessage, message_id)
    if message is None or message.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found.")
    return message


@router.get("/companies/{company_id}/messages/{message_id}")
def get_message(message_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    message = _message(db, ctx.company.id, message_id)
    box = db.get(MailAccount, message.mail_account_id) if message.mail_account_id else None
    tasks = db.scalars(select(Task).where(Task.message_id == message.id).order_by(Task.number)).all()
    agents = {a.id: a for a in db.scalars(select(Agent).where(Agent.company_id == ctx.company.id))}
    deliveries = db.scalars(
        select(Delivery).where(Delivery.task_id.in_([t.id for t in tasks])).order_by(Delivery.created_at)
    ).all()
    by_task = {t.id: t for t in tasks}
    return {
        **message_out(message, box, full=True),
        "tasks": [task_out(t, agents.get(t.assignee_id) if t.assignee_id else None) for t in tasks],
        "deliveries": [delivery_out(d, by_task.get(d.task_id), box) for d in deliveries],
    }


@router.post("/companies/{company_id}/messages/{message_id}/task", status_code=201)
def task_from_message(message_id: uuid.UUID, body: MessageTaskIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    message = _message(db, ctx.company.id, message_id)
    if get_contract(body.task_type) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown task type '{body.task_type}'.")
    agent = None
    if body.assignee_id:
        agent = db.get(Agent, body.assignee_id)
        if agent is None or agent.company_id != ctx.company.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown agent.")
        if body.task_type not in (agent.task_types or []):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"{agent.name} is not allowed to do '{body.task_type}'."
            )
    from .mail import ParsedMessage, source_text

    text = source_text(
        ParsedMessage(
            message_id=message.message_id,
            in_reply_to=message.in_reply_to,
            references=message.references,
            from_name=message.from_name,
            from_address=message.from_address,
            reply_to=message.reply_to,
            to=message.to_addresses,
            subject=message.subject,
            date=message.received_at,
            text=message.text,
            attachments=message.attachments or [],
            automatic=None,
            truncated=False,
        )
    )
    task = automation.create_task(
        db,
        ctx.company,
        title=body.title or f"{message.subject or '(no subject)'} — {message.from_address}",
        task_type=body.task_type,
        assignee=agent,
        sources=[{"id": f"mail-{message.id.hex[:12]}", "text": text}],
        origin="mail",
        message_id=message.id,
        actor=ctx.principal.actor,
    )
    message.status, message.status_note = "routed", f"{ctx.principal.name} created T-{task.number}"
    db.commit()
    return task_out(task, agent)


@router.post("/companies/{company_id}/messages/{message_id}/ignore")
def ignore_message(message_id: uuid.UUID, body: NoteIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    message = _message(db, ctx.company.id, message_id)
    message.status = "ignored"
    message.status_note = f"Ignored by {ctx.principal.name}" + (f": {body.note}" if body.note else "")
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "mail.ignored",
        "message",
        message.id,
        f"E-mail from {message.from_address} ignored",
    )
    db.commit()
    return message_out(message)


@router.post("/companies/{company_id}/messages/{message_id}/handled")
def message_handled(message_id: uuid.UUID, body: NoteIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    message = _message(db, ctx.company.id, message_id)
    message.status = "handled"
    message.status_note = f"Handled by {ctx.principal.name}" + (f": {body.note}" if body.note else "")
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "mail.handled",
        "message",
        message.id,
        f"E-mail from {message.from_address} handled by a person",
    )
    db.commit()
    return message_out(message)


# ---------------------------------------------------------------- deliveries


@router.get("/companies/{company_id}/deliveries")
def list_deliveries(
    ctx: CompanyDep,
    db: DbDep,
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(attention|ready|held|queued|sending|sent|failed|uncertain|cancelled)$"
    ),
    task: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    query = select(Delivery).where(Delivery.company_id == ctx.company.id)
    if status_filter == "attention":
        query = query.where(Delivery.status.in_(("ready", "held", "failed", "uncertain")))
    elif status_filter:
        query = query.where(Delivery.status == status_filter)
    if task:
        query = query.where(Delivery.task_id == task)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(Delivery.created_at.desc()).limit(limit).offset(offset)).all()
    tasks = {t.id: t for t in db.scalars(select(Task).where(Task.id.in_([d.task_id for d in rows])))}
    boxes = {m.id: m for m in db.scalars(select(MailAccount).where(MailAccount.company_id == ctx.company.id))}
    return {
        "items": [
            delivery_out(d, tasks.get(d.task_id), boxes.get(d.mail_account_id) if d.mail_account_id else None)
            for d in rows
        ],
        "total": total,
    }


def _delivery(db: DbDep, company_id: uuid.UUID, delivery_id: uuid.UUID) -> Delivery:
    row = db.scalar(
        select(Delivery).where(Delivery.id == delivery_id, Delivery.company_id == company_id).with_for_update()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "E-mail not found.")
    return row


@router.post("/companies/{company_id}/deliveries/{delivery_id}/send")
def send_delivery(delivery_id: uuid.UUID, body: DeliverySendIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    row = _delivery(db, ctx.company.id, delivery_id)
    try:
        delivery.release(db, row, ctx.principal.actor, confirm_resend=body.confirm_resend)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.commit()
    return delivery_out(row)


@router.post("/companies/{company_id}/deliveries/{delivery_id}/mark")
def mark_delivery(delivery_id: uuid.UUID, body: DeliveryMarkIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    row = _delivery(db, ctx.company.id, delivery_id)
    try:
        delivery.mark(db, row, body.status, ctx.principal.actor, body.note)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.commit()
    return delivery_out(row)


# ---------------------------------------------------------------- routines


def _routine(db: DbDep, company_id: uuid.UUID, routine_id: uuid.UUID) -> Routine:
    row = db.scalar(select(Routine).where(Routine.id == routine_id, Routine.company_id == company_id).with_for_update())
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine not found.")
    return row


def _check_routine(db: DbDep, company_id: uuid.UUID, cron: str, tz: str, task_type: str, agent_id: Any) -> Agent | None:
    errors = routines.validate(cron, tz)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(errors))
    if get_contract(task_type) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown task type '{task_type}'.")
    if agent_id is None:
        return None
    agent = db.get(Agent, agent_id)
    if agent is None or agent.company_id != company_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown agent.")
    if task_type not in (agent.task_types or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{agent.name} is not allowed to do '{task_type}'.")
    return agent


def _routine_view(db: DbDep, routine: Routine) -> dict[str, Any]:
    assignee = db.get(Agent, routine.assignee_id) if routine.assignee_id else None
    nxt = routines.upcoming(routine.cron, routine.timezone, 3) if routine.enabled else []
    return routine_out(routine, assignee, nxt)


@router.get("/companies/{company_id}/routines")
def list_routines(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    rows = db.scalars(select(Routine).where(Routine.company_id == ctx.company.id).order_by(Routine.created_at)).all()
    return [_routine_view(db, r) for r in rows]


@router.post("/companies/{company_id}/routines/preview")
def preview_schedule(body: SchedulePreviewIn, ctx: CompanyDep) -> dict[str, Any]:
    tz = body.timezone or ctx.company.timezone
    errors = routines.validate(body.cron, tz)
    if errors:
        return {"valid": False, "errors": errors, "upcoming": []}
    return {"valid": True, "errors": [], "upcoming": [iso(x) for x in routines.upcoming(body.cron, tz, 3)]}


@router.post("/companies/{company_id}/routines", status_code=201)
def create_routine(body: RoutineIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    if ctx.company.is_demo:
        raise HTTPException(status.HTTP_409_CONFLICT, "The demo company replays a recorded week; it has no routines.")
    tz = body.timezone or ctx.company.timezone
    _check_routine(db, ctx.company.id, body.cron, tz, body.task_type, body.assignee_id)
    routine = Routine(
        company_id=ctx.company.id,
        **body.model_dump(exclude={"timezone"}),
        timezone=tz,
        created_by=ctx.principal.name,
    )
    routine.next_run_at = routines.upcoming(routine.cron, tz, 1)[0]
    db.add(routine)
    db.flush()
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "routine.created",
        "routine",
        routine.id,
        f"Routine {routine.name} ({routine.cron}, {tz})",
    )
    db.commit()
    return _routine_view(db, routine)


@router.patch("/companies/{company_id}/routines/{routine_id}")
def update_routine(routine_id: uuid.UUID, body: RoutinePatch, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    routine = _routine(db, ctx.company.id, routine_id)
    data = body.model_dump(exclude_unset=True, exclude={"clear_assignee"})
    if body.clear_assignee:
        data["assignee_id"] = None
    merged = {
        "cron": data.get("cron", routine.cron),
        "timezone": data.get("timezone") or routine.timezone,
        "task_type": data.get("task_type", routine.task_type),
        "assignee_id": data.get("assignee_id", routine.assignee_id),
    }
    _check_routine(db, ctx.company.id, merged["cron"], merged["timezone"], merged["task_type"], merged["assignee_id"])
    for key, value in data.items():
        if key == "timezone" and not value:
            continue
        setattr(routine, key, value)
    routine.next_run_at = routines.upcoming(routine.cron, routine.timezone, 1)[0]
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "routine.updated",
        "routine",
        routine.id,
        f"Routine {routine.name} updated ({'on' if routine.enabled else 'off'})",
    )
    db.commit()
    return _routine_view(db, routine)


@router.delete("/companies/{company_id}/routines/{routine_id}")
def delete_routine(routine_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, str]:
    ctx.require("admin")
    routine = _routine(db, ctx.company.id, routine_id)
    name = routine.name
    db.delete(routine)
    record(db, ctx.company.id, ctx.principal.actor, "routine.deleted", "routine", routine_id, f"Routine {name} deleted")
    db.commit()
    return {"status": "deleted"}


@router.post("/companies/{company_id}/routines/{routine_id}/run", status_code=201)
def run_routine_now(routine_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    routine = _routine(db, ctx.company.id, routine_id)
    if ctx.company.emergency_stop:
        raise HTTPException(status.HTTP_409_CONFLICT, "Emergency stop is on.")
    next_run = routine.next_run_at
    task = routines.fire(db, routine, _now())
    routine.next_run_at = next_run  # running now does not move the schedule
    assert task is not None
    db.commit()
    assignee = db.get(Agent, task.assignee_id) if task.assignee_id else None
    return task_out(task, assignee)
