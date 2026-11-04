"""Outgoing e-mail: one Delivery per verified result, sent at most once by the worker.

Statuses: ready (no outgoing mailbox) · held (waits for a person: hourly limit or emergency stop)
· queued · sending · sent · failed · uncertain (the connection broke during the hand-over; a
person checks the Sent folder before anything is resent) · cancelled.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from email.utils import make_msgid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from . import jobs
from .audit import record
from .auth import SYSTEM, Actor
from .company_profile import settings_for
from .mail import SendDeferred, SendRejected, SendUncertain, Server, build_email, smtp_send
from .models import Approval, Company, Delivery, MailAccount, MailMessage, Task
from .outbound import OutgoingEmail
from .security import SecretError, decrypt

log = logging.getLogger("select.delivery")

MAX_ATTEMPTS = 3
STUCK_AFTER = timedelta(minutes=10)
COUNTED = ("queued", "sending", "sent", "uncertain")


def _now() -> datetime:
    return datetime.now(UTC)


def outgoing_account(db: Session, company_id: uuid.UUID, task: Task | None = None) -> MailAccount | None:
    accounts = db.scalars(
        select(MailAccount)
        .where(
            MailAccount.company_id == company_id,
            MailAccount.outbound_enabled.is_(True),
            MailAccount.smtp_host.is_not(None),
        )
        .order_by(MailAccount.created_at)
    ).all()
    if task is not None and task.message_id:
        message = db.get(MailMessage, task.message_id)
        for account in accounts:
            if message is not None and account.id == message.mail_account_id:
                return account  # answer from the mailbox that received the message
    return accounts[0] if accounts else None


def sent_last_hour(db: Session, company_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count()).where(
                Delivery.company_id == company_id,
                Delivery.status.in_(COUNTED),
                Delivery.created_at >= _now() - timedelta(hours=1),
            )
        )
        or 0
    )


def create(
    db: Session,
    task: Task,
    *,
    run_id: uuid.UUID | None,
    approval: Approval | None,
    email: OutgoingEmail,
    approved_by: str,
) -> Delivery:
    existing = db.scalar(select(Delivery).where(Delivery.task_id == task.id, Delivery.run_id == run_id))
    if existing is not None:
        return existing
    company = db.get(Company, task.company_id)
    assert company is not None
    account = outgoing_account(db, company.id, task)
    domain = account.address.rsplit("@", 1)[-1] if account else "select.invalid"
    delivery = Delivery(
        company_id=company.id,
        task_id=task.id,
        run_id=run_id,
        approval_id=approval.id if approval else None,
        mail_account_id=account.id if account else None,
        action=email.action,
        to_address=email.to,
        subject=email.subject,
        body=email.body,
        in_reply_to=email.in_reply_to,
        references=email.references,
        message_id=make_msgid(domain=domain),
        approved_by=approved_by[:120],
        is_demo=task.is_demo,
        status="queued",
    )
    cap = int(settings_for(company)["outbound_per_hour"])
    if account is None:
        delivery.status = "ready"
        delivery.status_note = "No outgoing mailbox is set up. Add one in Connections, then send it from Messages."
    elif company.emergency_stop:
        delivery.status, delivery.status_note = "held", "Emergency stop is on."
    elif sent_last_hour(db, company.id) >= cap:
        delivery.status = "held"
        delivery.status_note = f"Hourly limit of {cap} e-mails reached; a person releases it."
    db.add(delivery)
    db.flush()
    if delivery.status == "queued":
        jobs.enqueue(db, "deliver_email", {"delivery_id": str(delivery.id)}, company_id=company.id, max_attempts=1)
    record(
        db,
        company.id,
        SYSTEM,
        f"delivery.{delivery.status}",
        "task",
        task.id,
        f"T-{task.number}: e-mail to {delivery.to_address} "
        + {"queued": "queued for sending", "ready": "ready, no outgoing mailbox", "held": "held"}[delivery.status]
        + (f" ({delivery.status_note})" if delivery.status == "held" else ""),
        {"delivery_id": str(delivery.id), "approved_by": approved_by},
    )
    return delivery


def release(db: Session, delivery: Delivery, actor: Actor, *, confirm_resend: bool = False) -> Delivery:
    """A person sends a ready, held or failed e-mail, or resends an uncertain one knowingly."""
    if delivery.status == "uncertain" and not confirm_resend:
        raise ValueError("this e-mail may already have been sent; check the Sent folder, then confirm the resend")
    if delivery.status not in ("ready", "held", "failed", "uncertain"):
        raise ValueError(f"an e-mail that is {delivery.status} cannot be sent again")
    company = db.get(Company, delivery.company_id)
    assert company is not None
    if company.emergency_stop:
        raise ValueError("emergency stop is on")
    task = db.get(Task, delivery.task_id)
    account = db.get(MailAccount, delivery.mail_account_id) if delivery.mail_account_id else None
    if account is None or not account.outbound_enabled or not account.smtp_host:
        account = outgoing_account(db, company.id, task)
    if account is None:
        raise ValueError("no outgoing mailbox is set up; add one in Connections")
    delivery.mail_account_id = account.id
    previous = delivery.status
    delivery.status, delivery.status_note = "queued", f"Released by {actor.name}"
    delivery.attempts = 0 if previous != "uncertain" else delivery.attempts
    jobs.enqueue(db, "deliver_email", {"delivery_id": str(delivery.id)}, company_id=company.id, max_attempts=1)
    record(
        db,
        company.id,
        actor,
        "delivery.released",
        "task",
        delivery.task_id,
        f"{actor.name} sent the e-mail to {delivery.to_address} ({previous} → queued)",
        {"delivery_id": str(delivery.id)},
    )
    return delivery


def mark(db: Session, delivery: Delivery, new_status: str, actor: Actor, note: str = "") -> Delivery:
    """A person records the outcome: an uncertain e-mail was in fact sent, or one is cancelled."""
    allowed = {"sent": ("uncertain",), "cancelled": ("ready", "held", "failed", "uncertain")}
    if delivery.status not in allowed.get(new_status, ()):
        raise ValueError(f"an e-mail that is {delivery.status} cannot be marked {new_status}")
    previous = delivery.status
    delivery.status = new_status
    delivery.status_note = note or f"Marked {new_status} by {actor.name}"
    if new_status == "sent":
        delivery.sent_at = delivery.sent_at or _now()
    record(
        db,
        delivery.company_id,
        actor,
        f"delivery.marked_{new_status}",
        "task",
        delivery.task_id,
        f"{actor.name} marked the e-mail to {delivery.to_address} {new_status} (was {previous})",
        {"delivery_id": str(delivery.id), "note": note},
    )
    return delivery


def hold_all(db: Session, company_id: uuid.UUID, reason: str) -> int:
    result = db.execute(
        update(Delivery)
        .where(Delivery.company_id == company_id, Delivery.status == "queued")
        .values(status="held", status_note=reason)
    )
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


def _server(account: MailAccount) -> Server:
    password = decrypt(account.smtp_password_encrypted) if account.smtp_password_encrypted else None
    return Server(account.smtp_host or "", account.smtp_port, account.smtp_security, account.smtp_username, password)


def send(db: Session, delivery_id: uuid.UUID) -> str:
    """Worker job. Locks the row so two workers can never send the same e-mail."""
    delivery = db.scalar(select(Delivery).where(Delivery.id == delivery_id).with_for_update(skip_locked=True))
    if delivery is None:
        return "busy or missing"
    if delivery.status != "queued":
        return f"skipped: {delivery.status}"
    company = db.get(Company, delivery.company_id)
    task = db.get(Task, delivery.task_id)
    assert company is not None and task is not None
    if company.emergency_stop:
        delivery.status, delivery.status_note = "held", "Emergency stop is on."
        db.commit()
        return "held"
    account = db.get(MailAccount, delivery.mail_account_id) if delivery.mail_account_id else None
    if account is None or not account.outbound_enabled or not account.smtp_host:
        delivery.status, delivery.status_note = "ready", "The outgoing mailbox was removed or disabled."
        db.commit()
        return "ready"
    try:
        server = _server(account)
    except SecretError as exc:
        delivery.status, delivery.last_error = "failed", f"SMTP password cannot be decrypted: {exc}"
        db.commit()
        return "failed"
    try:
        message = build_email(
            from_address=account.address,
            from_name=account.display_name or company.name,
            to=delivery.to_address,
            subject=delivery.subject,
            body=delivery.body,
            message_id=delivery.message_id,
            in_reply_to=delivery.in_reply_to,
            references=delivery.references,
            review="human-approved" if delivery.approval_id else "autonomous",
        )
    except (ValueError, TypeError) as exc:
        delivery.status, delivery.last_error = "failed", f"The e-mail could not be built: {exc}"
        record(
            db,
            company.id,
            SYSTEM,
            "delivery.failed",
            "task",
            task.id,
            f"T-{task.number}: e-mail to {delivery.to_address} could not be built ({exc})",
            {"delivery_id": str(delivery.id)},
        )
        db.commit()
        return "failed"
    # From here a crash leaves the row "sending"; the sweeper turns it into "uncertain", never a resend.
    delivery.status, delivery.attempts = "sending", delivery.attempts + 1
    db.commit()
    try:
        response = smtp_send(server, message)
    except SendDeferred as exc:
        delivery.last_error = str(exc)
        if delivery.attempts < MAX_ATTEMPTS:
            delivery.status, delivery.status_note = "queued", f"Retrying after: {exc}"
            jobs.enqueue(
                db,
                "deliver_email",
                {"delivery_id": str(delivery.id)},
                company_id=company.id,
                max_attempts=1,
                run_after=_now() + timedelta(minutes=delivery.attempts * 2),
            )
        else:
            delivery.status, delivery.status_note = "failed", f"Gave up after {delivery.attempts} attempts."
    except SendRejected as exc:
        delivery.status, delivery.last_error, delivery.status_note = "failed", str(exc), "Refused by the server."
    except SendUncertain as exc:
        delivery.status, delivery.last_error = "uncertain", str(exc)
        delivery.status_note = "The connection broke while sending. Check the Sent folder before resending."
    else:
        delivery.status, delivery.sent_at, delivery.smtp_response = "sent", _now(), response
        delivery.status_note, delivery.last_error = None, None
        if task.message_id:
            message_row = db.get(MailMessage, task.message_id)
            if message_row is not None:
                message_row.status = "handled"
                message_row.status_note = f"Answered by T-{task.number}"
    record(
        db,
        company.id,
        SYSTEM,
        f"delivery.{delivery.status}",
        "task",
        task.id,
        f"T-{task.number}: e-mail to {delivery.to_address} {delivery.status}"
        + (f" ({delivery.last_error})" if delivery.status != "sent" and delivery.last_error else ""),
        {"delivery_id": str(delivery.id), "attempt": delivery.attempts},
    )
    db.commit()
    return delivery.status


def sweep(db: Session, now: datetime | None = None) -> int:
    """Rows left "sending" by a stopped worker become "uncertain"; queued rows without a job get one."""
    now = now or _now()
    changed = 0
    for delivery in db.scalars(
        select(Delivery)
        .where(Delivery.status == "sending", Delivery.updated_at < now - STUCK_AFTER)
        .with_for_update(skip_locked=True)
    ):
        delivery.status = "uncertain"
        delivery.status_note = "The worker stopped while sending. Check the Sent folder before resending."
        record(
            db,
            delivery.company_id,
            SYSTEM,
            "delivery.uncertain",
            "task",
            delivery.task_id,
            f"E-mail to {delivery.to_address}: sending was interrupted",
            {"delivery_id": str(delivery.id)},
        )
        changed += 1
    for delivery in db.scalars(
        select(Delivery)
        .where(Delivery.status == "queued", Delivery.updated_at < now - timedelta(minutes=2))
        .with_for_update(skip_locked=True)
    ):
        if not jobs.pending(db, "deliver_email", "delivery_id", str(delivery.id)):
            jobs.enqueue(db, "deliver_email", {"delivery_id": str(delivery.id)}, company_id=delivery.company_id)
            changed += 1
    return changed
