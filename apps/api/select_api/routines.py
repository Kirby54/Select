"""Routines: a task created on a schedule.

A schedule is a five-field cron expression evaluated in the routine's time zone (so "every
Monday at 08:30" stays 08:30 across daylight-saving changes). Routines run at most every
15 minutes. A run missed while the worker was stopped fires once, not once per missed slot.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from itertools import pairwise
from zoneinfo import ZoneInfo

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import record
from .auth import Actor
from .automation import create_task
from .company_profile import validate_timezone
from .models import Agent, Company, Routine, Task

MIN_GAP = timedelta(minutes=15)


def upcoming(cron: str, timezone: str, count: int = 3, after: datetime | None = None) -> list[datetime]:
    start = (after or datetime.now(UTC)).astimezone(ZoneInfo(timezone))
    it = croniter(cron, start)
    return [it.get_next(datetime).astimezone(UTC) for _ in range(count)]


def validate(cron: str, timezone: str) -> list[str]:
    error = validate_timezone(timezone)
    if error:
        return [error]
    if len(cron.split()) != 5:
        return ["use five fields: minute hour day-of-month month day-of-week (for example 30 8 * * 1)"]
    if not croniter.is_valid(cron):
        return ["this is not a valid schedule"]
    runs = upcoming(cron, timezone, 8)
    if any(later - earlier < MIN_GAP for earlier, later in pairwise(runs)):
        return ["a routine runs at most every 15 minutes"]
    return []


def actor_for(routine: Routine) -> Actor:
    return Actor("system", f"routine:{routine.id}", f"Routine: {routine.name}"[:120])


def fire(db: Session, routine: Routine, now: datetime) -> Task | None:
    routine.next_run_at = upcoming(routine.cron, routine.timezone, 1, after=now)[0]
    company = db.get(Company, routine.company_id)
    assert company is not None
    actor = actor_for(routine)
    if company.emergency_stop:
        record(db, company.id, actor, "routine.skipped", "routine", routine.id, f"{routine.name}: emergency stop")
        return None
    assignee = db.get(Agent, routine.assignee_id) if routine.assignee_id else None
    if assignee is not None and assignee.status == "archived":
        assignee = None
    task = create_task(
        db,
        company,
        title=routine.title,
        description=routine.description,
        task_type=routine.task_type,
        assignee=assignee,
        priority=routine.priority,
        project_id=routine.project_id,
        origin="routine",
        created_by=f"Routine: {routine.name}",
        routine_id=routine.id,
        actor=actor,
    )
    routine.last_run_at, routine.last_task_id = now, task.id
    routine.runs_count += 1
    return task


def fire_due(db: Session, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    due = db.scalars(
        select(Routine)
        .where(Routine.enabled.is_(True), Routine.next_run_at.is_not(None), Routine.next_run_at <= now)
        .order_by(Routine.next_run_at)
        .limit(20)
        .with_for_update(skip_locked=True)
    ).all()
    for routine in due:
        fire(db, routine, now)
    return len(due)
