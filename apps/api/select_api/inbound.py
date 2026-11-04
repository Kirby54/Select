"""Incoming mail: poll a mailbox, store each new message, hand it to the triage agent.

A message from the company's own address, an automatic message (out-of-office, bounce,
newsletter) or one that cannot be read is stored and marked, never answered automatically.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import record
from .auth import SYSTEM
from .automation import TRIAGE_TITLE, create_task, pick_agent
from .mail import MailError, ParsedMessage, Server, imap_fetch_new, parse_message, source_text
from .models import Company, Delivery, MailAccount, MailMessage, Task
from .security import SecretError, decrypt

log = logging.getLogger("select.inbound")


def imap_server(account: MailAccount) -> Server:
    password = decrypt(account.imap_password_encrypted) if account.imap_password_encrypted else None
    return Server(account.imap_host or "", account.imap_port, account.imap_security, account.imap_username, password)


def poll(db: Session, account_id: uuid.UUID) -> dict[str, object]:
    """Worker job. Only one poll of a mailbox runs at a time (row lock)."""
    account = db.scalar(select(MailAccount).where(MailAccount.id == account_id).with_for_update(skip_locked=True))
    if account is None:
        return {"skipped": "busy or removed"}
    company = db.get(Company, account.company_id)
    assert company is not None
    if not account.inbound_enabled or not account.imap_host:
        return {"skipped": "reading is off for this mailbox"}
    now = datetime.now(UTC)
    try:
        result = imap_fetch_new(
            imap_server(account),
            account.imap_folder,
            account.imap_uidvalidity,
            account.imap_last_uid,
            import_days=account.import_days,
        )
    except (MailError, SecretError) as exc:
        if account.last_poll_ok is not False:
            record(db, company.id, SYSTEM, "mail.poll_failed", "mailbox", account.id, f"{account.address}: {exc}")
        account.last_poll_ok, account.last_poll_error, account.last_poll_at = False, str(exc)[:1000], now
        db.commit()
        return {"error": str(exc)}
    imported = 0
    for uid, raw, truncated in result.messages:
        if ingest(db, company, account, result.uidvalidity, uid, raw, truncated=truncated) is not None:
            imported += 1
    if result.baseline:
        record(
            db,
            company.id,
            SYSTEM,
            "mail.connected",
            "mailbox",
            account.id,
            f"{account.address}: reading new mail from now on"
            + (
                f", plus {imported} message(s) from the last {account.import_days} day(s)"
                if account.import_days
                else ""
            ),
        )
    elif account.last_poll_ok is False:
        record(
            db, company.id, SYSTEM, "mail.poll_recovered", "mailbox", account.id, f"{account.address}: reading again"
        )
    account.imap_uidvalidity, account.imap_last_uid = result.uidvalidity, result.last_uid
    account.last_poll_ok, account.last_poll_error, account.last_poll_at = True, None, now
    db.commit()
    return {"imported": imported, "baseline": result.baseline}


def _reply_to_delivery(db: Session, company_id: uuid.UUID, parsed: ParsedMessage) -> Task | None:
    ids = set(re.findall(r"<[^<>\s]+>", f"{parsed.in_reply_to or ''} {parsed.references or ''}"))
    if not ids:
        return None
    delivery = db.scalar(
        select(Delivery).where(Delivery.company_id == company_id, Delivery.message_id.in_(ids)).limit(1)
    )
    return db.get(Task, delivery.task_id) if delivery is not None else None


def ingest(
    db: Session,
    company: Company,
    account: MailAccount,
    uidvalidity: int,
    uid: int,
    raw: bytes,
    *,
    truncated: bool = False,
) -> MailMessage | None:
    fallback_id = f"<uid-{uidvalidity}-{uid}@{account.id.hex}.select.invalid>"
    try:
        parsed = parse_message(raw, truncated=truncated)
    except Exception as exc:  # noqa: BLE001 - an unreadable message is stored as failed and shown, never dropped
        log.warning("message %s of %s could not be parsed: %s", uid, account.address, exc)
        if db.scalar(
            select(MailMessage.id).where(
                MailMessage.mail_account_id == account.id, MailMessage.message_id == fallback_id
            )
        ):
            return None
        row = MailMessage(
            company_id=company.id,
            mail_account_id=account.id,
            uidvalidity=uidvalidity,
            uid=uid,
            message_id=fallback_id,
            status="failed",
            status_note=f"Select could not read this message: {type(exc).__name__}: {exc}",
        )
        db.add(row)
        record(db, company.id, SYSTEM, "mail.unreadable", "message", account.id, f"{account.address}: message {uid}")
        return row
    message_id = (parsed.message_id or fallback_id)[:500]
    exists = db.scalar(
        select(MailMessage.id).where(MailMessage.mail_account_id == account.id, MailMessage.message_id == message_id)
    )
    if exists is not None:
        return None
    row = MailMessage(
        company_id=company.id,
        mail_account_id=account.id,
        uidvalidity=uidvalidity,
        uid=uid,
        message_id=message_id,
        in_reply_to=(parsed.in_reply_to or None) and parsed.in_reply_to[:500],
        references=parsed.references,
        from_address=parsed.from_address[:254],
        from_name=parsed.from_name[:200],
        reply_to=parsed.reply_to[:254] if parsed.reply_to else None,
        to_addresses=parsed.to,
        subject=parsed.subject[:500],
        text=parsed.text,
        attachments=parsed.attachments,
        automatic=parsed.automatic is not None,
        received_at=parsed.date or datetime.now(UTC),
        status="new",
    )
    db.add(row)
    db.flush()
    own = {a.lower() for a in db.scalars(select(MailAccount.address).where(MailAccount.company_id == company.id)).all()}
    thread = _reply_to_delivery(db, company.id, parsed)
    if parsed.from_address in own:
        row.status, row.status_note = "ignored", "Sent from one of the company's own mailboxes."
    elif parsed.automatic:
        row.status, row.status_note = "ignored", f"{parsed.automatic[0].upper()}{parsed.automatic[1:]}: never answered."
    else:
        agent = pick_agent(db, company.id, "message_triage")
        if agent is None:
            row.status, row.status_note = "needs_human", "No active agent may triage messages; a person decides."
        else:
            language = company.language if company.language in TRIAGE_TITLE else "en"
            task = create_task(
                db,
                company,
                title=f"{TRIAGE_TITLE[language]}: {parsed.subject or '(no subject)'}",
                task_type="message_triage",
                assignee=agent,
                sources=[{"id": f"mail-{row.id.hex[:12]}", "text": source_text(parsed)}],
                origin="mail",
                created_by="Select",
                message_id=row.id,
                actor=SYSTEM,
            )
            row.status, row.status_note = "triage", f"Triage T-{task.number} → {agent.name}"
        if thread is not None:
            row.status_note = f"Reply to our e-mail for T-{thread.number}. " + (row.status_note or "")
    record(
        db,
        company.id,
        SYSTEM,
        "mail.received",
        "message",
        row.id,
        f"E-mail from {parsed.from_address or 'unknown sender'}: {parsed.subject or '(no subject)'} ({row.status})",
        {"mailbox": account.address},
    )
    return row
