"""Durable job queue on PostgreSQL. Jobs survive restarts; a crashed worker's job is retried."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .models import Job

STALE_AFTER = timedelta(minutes=10)


def enqueue(
    db: Session, kind: str, payload: dict[str, Any], *, company_id: uuid.UUID | None = None, max_attempts: int = 3
) -> Job:
    job = Job(kind=kind, payload=payload, company_id=company_id, max_attempts=max_attempts)
    db.add(job)
    db.flush()
    return job


def claim(db: Session, worker_id: str) -> Job | None:
    now = datetime.now(UTC)
    # Jobs left "running" by a crashed worker go back to the queue.
    db.execute(
        update(Job)
        .where(Job.status == "running", Job.locked_at < now - STALE_AFTER)
        .values(status="queued", locked_at=None, locked_by=None)
    )
    job = db.scalar(
        select(Job)
        .where(Job.status == "queued", Job.run_after <= now)
        .order_by(Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is None:
        db.commit()
        return None
    job.status = "running"
    job.locked_at = now
    job.locked_by = worker_id
    job.attempts += 1
    db.commit()
    return job


def finish(db: Session, job: Job) -> None:
    job.status = "done"
    job.finished_at = datetime.now(UTC)
    job.locked_by = None
    db.commit()


def fail(db: Session, job: Job, error: str, *, retry: bool = True) -> None:
    job.last_error = error[:4000]
    job.locked_by = None
    if retry and job.attempts < job.max_attempts:
        job.status = "queued"
        job.run_after = datetime.now(UTC) + timedelta(seconds=10 * job.attempts)
    else:
        job.status = "failed"
        job.finished_at = datetime.now(UTC)
    db.commit()


def cancel_company_jobs(db: Session, company_id: uuid.UUID) -> int:
    result = db.execute(
        update(Job).where(Job.company_id == company_id, Job.status == "queued").values(status="cancelled")
    )
    return int(result.rowcount or 0)  # type: ignore[attr-defined]
