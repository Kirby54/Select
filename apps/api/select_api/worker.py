"""Worker process: claims durable jobs and runs them, and keeps the schedule.

Several workers may run side by side: jobs, routines, mailboxes and e-mails are claimed with
row locks (FOR UPDATE SKIP LOCKED), so each is handled by one worker only.
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import time
import uuid
from datetime import UTC, datetime, timedelta
from types import FrameType

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import delivery, demo, inbound, jobs, routines, runner
from .config import get_settings
from .db import _factory
from .jobs import claim, fail, finish
from .models import Job, MailAccount

log = logging.getLogger("select.worker")


def handle(job: Job) -> None:
    session = _factory()()
    try:
        if job.kind == "run_task":
            runner.execute(session, uuid.UUID(job.payload["task_id"]))
        elif job.kind == "deliver_email":
            sent = delivery.send(session, uuid.UUID(job.payload["delivery_id"]))
            log.info("delivery %s: %s", job.payload["delivery_id"], sent)
        elif job.kind == "mail_poll":
            read = inbound.poll(session, uuid.UUID(job.payload["account_id"]))
            log.info("mailbox %s: %s", job.payload["account_id"], read)
        elif job.kind == "demo_week":
            tracked = session.get(Job, job.id)
            assert tracked is not None

            def progress(done: int, total: int, day: int) -> None:
                tracked.progress = {"done": done, "total": total, "day": day}
                session.commit()

            stats = demo.play(session, uuid.UUID(job.payload["user_id"]), progress)
            tracked.progress = {**tracked.progress, "stats": stats}
            session.commit()
        else:
            raise ValueError(f"unknown job kind '{job.kind}'")
    finally:
        session.close()


def run_once(worker_id: str) -> bool:
    session = _factory()()
    try:
        job = claim(session, worker_id)
        if job is None:
            return False
        log.info("job %s %s started (attempt %s)", job.id, job.kind, job.attempts)
        try:
            handle(job)
        except runner.RunRefused as exc:
            log.warning("job %s refused: %s", job.id, exc)
            fail(session, job, str(exc), retry=False)
            return True
        except Exception as exc:
            log.exception("job %s failed", job.id)
            fail(session, job, f"{type(exc).__name__}: {exc}", retry=job.kind not in ("demo_week", "deliver_email"))
            return True
        finish(session, job)
        log.info("job %s done", job.id)
        return True
    finally:
        session.close()


def schedule_polls(db: Session, now: datetime) -> int:
    queued = 0
    for account in db.scalars(
        select(MailAccount).where(MailAccount.inbound_enabled.is_(True), MailAccount.imap_host.is_not(None))
    ):
        interval = timedelta(seconds=max(60, account.poll_seconds))
        if account.last_poll_at is not None and account.last_poll_at > now - interval:
            continue
        if jobs.pending(db, "mail_poll", "account_id", str(account.id)):
            continue
        jobs.enqueue(db, "mail_poll", {"account_id": str(account.id)}, company_id=account.company_id, max_attempts=1)
        queued += 1
    return queued


def tick(now: datetime | None = None) -> dict[str, int]:
    """One pass of the schedule: due routines, mailboxes to read, e-mails left half-sent."""
    now = now or datetime.now(UTC)
    session = _factory()()
    try:
        stats = {
            "routines": routines.fire_due(session, now),
            "polls": schedule_polls(session, now),
            "deliveries": delivery.sweep(session, now),
        }
        session.commit()
        return stats
    finally:
        session.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    stopping = False

    def stop(signum: int, _frame: FrameType | None) -> None:
        nonlocal stopping
        log.info("signal %s received, finishing the current job then stopping", signum)
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    log.info(
        "worker %s polling jobs every %ss, schedule every %ss",
        worker_id,
        settings.worker_poll_seconds,
        settings.scheduler_seconds,
    )
    next_tick = 0.0
    while not stopping:
        if time.monotonic() >= next_tick:
            try:
                stats = tick()
                if any(stats.values()):
                    log.info("schedule: %s", stats)
            except Exception:
                log.exception("schedule pass failed; retrying at the next pass")
            next_tick = time.monotonic() + settings.scheduler_seconds
        try:
            worked = run_once(worker_id)
        except Exception:
            log.exception("worker loop error; retrying shortly")
            worked = False
        if not worked:
            time.sleep(settings.worker_poll_seconds)
