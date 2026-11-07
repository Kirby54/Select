"""Work that moves without a person: tasks start, triaged mail is routed, results are sent.

Every decision here is code acting on stored, verified data. A model never decides to start,
route, send or schedule anything: it classifies a message, and code reads that verified
classification and the company's routing table.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import capabilities, jobs
from .audit import record
from .auth import SYSTEM, Actor
from .company_profile import settings_for
from .guards import RunRefused, check_can_run
from .models import Agent, Approval, Company, Job, MailMessage, ProviderConnection, Task, TaskComment

if TYPE_CHECKING:
    from .outbound import OutgoingEmail

ORIGINS = ("user", "mail", "routing", "routine", "api", "demo")

ROUTED_TITLES: dict[str, dict[str, str]] = {
    "fr": {"quote": "Devis", "support_reply": "Réponse", "general_task": "À traiter"},
    "de": {"quote": "Angebot", "support_reply": "Antwort", "general_task": "Bearbeiten"},
    "en": {"quote": "Quote", "support_reply": "Reply", "general_task": "Handle"},
}
TRIAGE_TITLE = {"fr": "Tri", "de": "Sichtung", "en": "Triage"}


def next_task_number(db: Session, company_id: uuid.UUID) -> int:
    # Lock the company row so concurrent creations get distinct numbers.
    db.scalar(select(Company).where(Company.id == company_id).with_for_update())
    return int(db.scalar(select(func.coalesce(func.max(Task.number), 0)).where(Task.company_id == company_id)) or 0) + 1


def create_task(
    db: Session,
    company: Company,
    *,
    title: str,
    task_type: str,
    actor: Actor,
    assignee: Agent | None = None,
    description: str = "",
    priority: str = "medium",
    sources: list[dict[str, str]] | None = None,
    resource_scope: str | None = None,
    origin: str = "user",
    created_by: str | None = None,
    parent_id: uuid.UUID | None = None,
    message_id: uuid.UUID | None = None,
    routine_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    goal_id: uuid.UUID | None = None,
    due_date: date | None = None,
    status: str = "todo",
    autorun: bool = True,
) -> Task:
    number = next_task_number(db, company.id)
    task = Task(
        company_id=company.id,
        number=number,
        title=title[:200],
        description=description,
        task_type=task_type,
        assignee_id=assignee.id if assignee else None,
        project_id=project_id,
        goal_id=goal_id,
        parent_id=parent_id,
        priority=priority,
        status=status,
        due_date=due_date,
        inputs={"sources": list(sources or []), **({"resource_scope": resource_scope} if resource_scope else {})},
        created_by=(created_by or actor.name)[:80],
        origin=origin,
        message_id=message_id,
        routine_id=routine_id,
    )
    db.add(task)
    db.flush()
    record(
        db,
        company.id,
        actor,
        "task.created",
        "task",
        task.id,
        f"T-{number} {task.title}" + (f" → {assignee.name}" if assignee else ""),
        {"origin": origin},
    )
    if autorun:
        maybe_autorun(db, company, task, actor)
    return task


def run_pending(db: Session, task_id: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(Job.id).where(
                Job.kind == "run_task",
                Job.status.in_(("queued", "running")),
                Job.payload["task_id"].as_string() == str(task_id),
            )
        )
        is not None
    )


def maybe_autorun(db: Session, company: Company, task: Task, actor: Actor) -> bool:
    """Start the task now when the company allows it and its agent can run live.

    An agent without a provider is driven from outside (submission API) or not set up yet: its
    tasks wait without comment. A configured agent that cannot run says why on the task.
    """
    if task.is_demo or task.status != "todo" or task.assignee_id is None:
        return False
    if not settings_for(company)["auto_run"]:
        return False
    agent = db.get(Agent, task.assignee_id)
    if agent is None or not agent.provider or not agent.model or run_pending(db, task.id):
        return False
    try:
        capabilities.require_task(agent, task)
        check_can_run(db, company, agent)
    except (RunRefused, capabilities.CapabilityDenied) as exc:
        db.add(
            TaskComment(
                task_id=task.id,
                author_type="system",
                author_id="select",
                author_name="Select",
                body=f"Not started automatically: {exc}",
            )
        )
        record(db, company.id, SYSTEM, "run.not_started", "task", task.id, f"T-{task.number}: {exc}")
        return False
    jobs.enqueue(db, "run_task", {"task_id": str(task.id)}, company_id=company.id)
    task.status = "in_progress"
    record(
        db,
        company.id,
        actor,
        "run.queued",
        "task",
        task.id,
        f"T-{task.number} started automatically for {agent.name}",
    )
    return True


def connected_providers(db: Session, company_id: uuid.UUID) -> set[str]:
    rows = db.scalars(
        select(ProviderConnection).where(
            ProviderConnection.company_id == company_id, ProviderConnection.enabled.is_(True)
        )
    ).all()
    return {c.provider for c in rows if c.secret_encrypted or c.provider == "ollama"}


# Free-form work any agent may take. Its contract sends every result to a person, whatever the
# agent's autonomy, so allowing it everywhere never lets anything leave unreviewed.
ANY_AGENT_TASK_TYPES = frozenset({"general_task"})


def may_do(agent: Agent, task_type: str) -> bool:
    return task_type in ANY_AGENT_TASK_TYPES or task_type in (agent.task_types or [])


def pick_agent(db: Session, company_id: uuid.UUID, task_type: str) -> Agent | None:
    """The active agent allowed to do ``task_type`` that is connected and least busy."""
    candidates = [
        a
        for a in db.scalars(
            select(Agent).where(Agent.company_id == company_id, Agent.status == "active").order_by(Agent.position)
        )
        if task_type in (a.task_types or [])
    ]
    if not candidates:
        return None
    providers = connected_providers(db, company_id)
    open_counts = dict(
        db.execute(
            select(Task.assignee_id, func.count())
            .where(
                Task.company_id == company_id,
                Task.status.in_(("todo", "in_progress", "awaiting_approval")),
                Task.archived_at.is_(None),
            )
            .group_by(Task.assignee_id)
        ).all()
    )
    return min(
        candidates,
        key=lambda a: (
            not (a.provider and a.model and a.provider in providers),
            open_counts.get(a.id, 0),
            a.position,
        ),
    )


def on_done(
    db: Session,
    task: Task,
    *,
    run_id: uuid.UUID | None,
    approval: Approval | None,
    email: OutgoingEmail | None,
    approved_by: str,
) -> None:
    """Follow-ups once a result is verified and accepted (by a person or by an earned licence)."""
    if task.is_demo:
        return
    if task.task_type == "message_triage":
        route_triage(db, task)
    if email is not None:
        from . import delivery

        delivery.create(db, task, run_id=run_id, approval=approval, email=email, approved_by=approved_by)


def route_triage(db: Session, task: Task) -> Task | None:
    company = db.get(Company, task.company_id)
    assert company is not None
    result: dict[str, Any] = task.result or {}
    category = str(result.get("category", "other"))
    priority = {"low": "low", "normal": "medium", "high": "high"}.get(str(result.get("priority")), "medium")
    target = settings_for(company)["routing"].get(category, "human")
    message = db.get(MailMessage, task.message_id) if task.message_id else None
    summary = str(result.get("summary") or "").strip()[:500]
    if target == "ignore":
        if message is not None:
            message.status, message.status_note = "ignored", f"Triaged as {category}; the routing ignores it."
        record(db, company.id, SYSTEM, "routing.ignored", "task", task.id, f"T-{task.number} triaged as {category}")
        return None
    agent = pick_agent(db, company.id, target) if target != "human" else None
    if agent is None:
        reason = "the routing sends it to a person" if target == "human" else f"no active agent may do '{target}'"
        if message is not None:
            message.status, message.status_note = "needs_human", f"Triaged as {category}; {reason}."
        record(
            db,
            company.id,
            SYSTEM,
            "routing.to_human",
            "task",
            task.id,
            f"T-{task.number} triaged as {category}: {reason}",
        )
        return None
    language = company.language if company.language in ROUTED_TITLES else "en"
    subject = message.subject if message is not None and message.subject else task.title
    follow_up = create_task(
        db,
        company,
        title=f"{ROUTED_TITLES[language][target]}: {subject}",
        description=summary,
        task_type=target,
        assignee=agent,
        priority=priority,
        sources=(task.inputs or {}).get("sources", []),
        origin="routing",
        created_by="Select",
        parent_id=task.id,
        message_id=task.message_id,
        project_id=task.project_id,
        actor=SYSTEM,
    )
    if message is not None:
        message.status, message.status_note = "routed", f"Triaged as {category} → T-{follow_up.number}"
    record(
        db,
        company.id,
        SYSTEM,
        "routing.routed",
        "task",
        task.id,
        f"T-{task.number} triaged as {category} → T-{follow_up.number} for {agent.name}",
        {"follow_up": str(follow_up.id), "category": category},
    )
    return follow_up
