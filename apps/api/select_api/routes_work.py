"""Tasks, runs, submissions, approvals and receipts."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select, update

from . import automation, jobs, runner
from .audit import record
from .auth import Actor, CompanyDep, DbDep
from .contracts import get_contract
from .models import (
    Agent,
    Approval,
    AuditEvent,
    Delivery,
    Goal,
    Job,
    MailAccount,
    MailMessage,
    Project,
    ReceiptRow,
    Run,
    Task,
    TaskComment,
)
from .pipeline import PipelineError, decide, new_run, process_output, report_problem
from .views import (
    CommentIn,
    DecisionIn,
    NoteIn,
    SubmitIn,
    TaskIn,
    TaskPatch,
    approval_out,
    audit_out,
    comment_out,
    delivery_out,
    message_out,
    receipt_out,
    run_out,
    task_out,
)

router = APIRouter(prefix="/api/companies/{company_id}")


def _task(db: DbDep, company_id: uuid.UUID, task_id: uuid.UUID, *, lock: bool = False) -> Task:
    query = select(Task).where(Task.id == task_id, Task.company_id == company_id)
    if lock:
        query = query.with_for_update()
    task = db.scalar(query)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return task


def _agent_in_company(db: DbDep, company_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    agent = db.get(Agent, agent_id)
    if agent is None or agent.company_id != company_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown agent.")
    return agent


@router.get("/tasks")
def list_tasks(
    ctx: CompanyDep,
    db: DbDep,
    status_filter: list[str] | None = Query(default=None, alias="status"),
    assignee: uuid.UUID | None = None,
    task_type: str | None = None,
    project: uuid.UUID | None = None,
    goal: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=100),
    include_archived: bool = False,
    sort: str = Query(default="updated", pattern="^(updated|created|priority|number)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    query = select(Task).where(Task.company_id == ctx.company.id)
    if not include_archived:
        query = query.where(Task.archived_at.is_(None))
    if status_filter:
        query = query.where(Task.status.in_(status_filter))
    if assignee:
        query = query.where(Task.assignee_id == assignee)
    if task_type:
        query = query.where(Task.task_type == task_type)
    if project:
        query = query.where(Task.project_id == project)
    if goal:
        query = query.where(Task.goal_id == goal)
    if q:
        like = f"%{q}%"
        conditions = [Task.title.ilike(like)]
        if q.upper().startswith("T-") and q[2:].isdigit():
            conditions.append(Task.number == int(q[2:]))
        query = query.where(or_(*conditions))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = {
        "updated": Task.updated_at.desc(),
        "created": Task.created_at.desc(),
        "number": Task.number.desc(),
        "priority": Task.priority.desc(),
    }[sort]
    tasks = db.scalars(query.order_by(order, Task.number.desc()).limit(limit).offset(offset)).all()
    agents = {a.id: a for a in db.scalars(select(Agent).where(Agent.company_id == ctx.company.id))}
    return {
        "items": [task_out(t, agents.get(t.assignee_id)) for t in tasks],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/tasks", status_code=201)
def create_task(body: TaskIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    if get_contract(body.task_type) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown task type '{body.task_type}'.")
    assignee = None
    if body.assignee_id:
        assignee = _agent_in_company(db, ctx.company.id, body.assignee_id)
        if not automation.may_do(assignee, body.task_type):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"{assignee.name} is not allowed to do '{body.task_type}'. Add it on the agent first.",
            )
    linked: list[tuple[str, Project | Goal | Task | None]] = [
        ("project", db.get(Project, body.project_id) if body.project_id else None),
        ("goal", db.get(Goal, body.goal_id) if body.goal_id else None),
        ("parent task", db.get(Task, body.parent_id) if body.parent_id else None),
    ]
    for (label, row), ref in zip(linked, (body.project_id, body.goal_id, body.parent_id), strict=True):
        if ref is not None and (row is None or row.company_id != ctx.company.id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown {label}.")
    task = automation.create_task(
        db,
        ctx.company,
        title=body.title,
        description=body.description,
        task_type=body.task_type,
        assignee=assignee,
        priority=body.priority,
        status=body.status,
        due_date=body.due_date,
        project_id=body.project_id,
        goal_id=body.goal_id,
        parent_id=body.parent_id,
        sources=[s.model_dump() for s in body.sources],
        origin="user",
        actor=ctx.principal.actor,
    )
    db.commit()
    return task_out(task, assignee)


@router.get("/tasks/{task_id}")
def get_task(task_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    task = _task(db, ctx.company.id, task_id)
    assignee = db.get(Agent, task.assignee_id) if task.assignee_id else None
    comments = db.scalars(
        select(TaskComment).where(TaskComment.task_id == task.id).order_by(TaskComment.created_at)
    ).all()
    runs = db.scalars(select(Run).where(Run.task_id == task.id).order_by(Run.attempt)).all()
    receipts = db.scalars(select(ReceiptRow).where(ReceiptRow.task_id == task.id).order_by(ReceiptRow.created_at)).all()
    approvals = db.scalars(select(Approval).where(Approval.task_id == task.id).order_by(Approval.created_at)).all()
    history = db.scalars(
        select(AuditEvent)
        .where(
            AuditEvent.company_id == ctx.company.id,
            or_(AuditEvent.entity_id == str(task.id), AuditEvent.data["task_id"].as_string() == str(task.id)),
        )
        .order_by(AuditEvent.created_at)
    ).all()
    pending_job = db.scalar(
        select(Job).where(
            Job.kind == "run_task",
            Job.status.in_(("queued", "running")),
            Job.payload["task_id"].as_string() == str(task.id),
        )
    )
    receipts_by_id = {r.id: r for r in receipts}
    deliveries = db.scalars(select(Delivery).where(Delivery.task_id == task.id).order_by(Delivery.created_at)).all()
    boxes = {m.id: m for m in db.scalars(select(MailAccount).where(MailAccount.company_id == ctx.company.id))}
    message = db.get(MailMessage, task.message_id) if task.message_id else None
    return {
        **task_out(task, assignee),
        "comments": [comment_out(c) for c in comments],
        "runs": [run_out(r) for r in runs],
        "receipts": [receipt_out(r) for r in receipts],
        "approvals": [approval_out(a, task, assignee, receipts_by_id.get(a.receipt_id)) for a in approvals],
        "history": [audit_out(e) for e in history],
        "deliveries": [
            delivery_out(d, task, boxes.get(d.mail_account_id) if d.mail_account_id else None) for d in deliveries
        ],
        "message": message_out(message, boxes.get(message.mail_account_id) if message.mail_account_id else None)
        if message
        else None,
        "run_pending": pending_job is not None,
    }


@router.patch("/tasks/{task_id}")
def patch_task(task_id: uuid.UUID, body: TaskPatch, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    task = _task(db, ctx.company.id, task_id, lock=True)
    if body.version != task.version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "This task changed since you opened it. Reload to see the latest version.",
                "current": task_out(task),
            },
        )
    data = body.model_dump(exclude_unset=True, exclude={"version", "clear_assignee"})
    if body.clear_assignee:
        data["assignee_id"] = None
    elif data.get("assignee_id"):
        agent = _agent_in_company(db, ctx.company.id, data["assignee_id"])
        if not automation.may_do(agent, task.task_type):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"{agent.name} is not allowed to do '{task.task_type}'."
            )
    if "status" in data and task.status == "awaiting_approval":
        raise HTTPException(status.HTTP_409_CONFLICT, "Decide the pending approval before changing the status.")
    changed = {k: {"from": str(getattr(task, k)), "to": str(v)} for k, v in data.items() if getattr(task, k) != v}
    for key, value in data.items():
        setattr(task, key, value)
    task.version += 1
    if changed:
        record(
            db,
            ctx.company.id,
            ctx.principal.actor,
            "task.updated",
            "task",
            task.id,
            f"T-{task.number} updated: {', '.join(changed)}",
            changed,
        )
    if "assignee_id" in changed or ("status" in changed and task.status == "todo"):
        automation.maybe_autorun(db, ctx.company, task, ctx.principal.actor)
    db.commit()
    return get_task(task_id, ctx, db)


@router.post("/tasks/{task_id}/archive")
def archive_task(task_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    task = _task(db, ctx.company.id, task_id, lock=True)
    if task.status in ("in_progress", "awaiting_approval"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancel the task or decide its approval before archiving it.")
    task.archived_at = datetime.now(UTC)
    task.version += 1
    record(db, ctx.company.id, ctx.principal.actor, "task.archived", "task", task.id, f"T-{task.number} archived")
    db.commit()
    return task_out(task)


@router.post("/tasks/{task_id}/comments", status_code=201)
def add_comment(task_id: uuid.UUID, body: CommentIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    task = _task(db, ctx.company.id, task_id)
    comment = TaskComment(
        task_id=task.id,
        author_type="user",
        author_id=str(ctx.principal.user_id),
        author_name=ctx.principal.name,
        body=body.body,
    )
    db.add(comment)
    db.commit()
    return comment_out(comment)


@router.post("/tasks/{task_id}/run", status_code=202)
def run_task(task_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    """Queue a live run. Refused immediately (409) when it could not start, with the reason."""
    ctx.require("member")
    task = _task(db, ctx.company.id, task_id, lock=True)
    if task.is_demo:
        raise HTTPException(status.HTTP_409_CONFLICT, "Demo tasks are replayed from recordings and cannot run live.")
    if task.status in ("done", "cancelled", "awaiting_approval"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Task is {task.status.replace('_', ' ')}.")
    existing = db.scalar(
        select(Job).where(
            Job.kind == "run_task",
            Job.status.in_(("queued", "running")),
            Job.payload["task_id"].as_string() == str(task.id),
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A run is already queued for this task.")
    agent = db.get(Agent, task.assignee_id) if task.assignee_id else None
    try:
        runner.check_can_run(db, ctx.company, agent)
    except runner.RunRefused as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    job = jobs.enqueue(db, "run_task", {"task_id": str(task.id)}, company_id=ctx.company.id)
    task.status = "in_progress"
    task.version += 1
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "run.queued",
        "task",
        task.id,
        f"T-{task.number} queued for {agent.name if agent else '?'}",
    )
    db.commit()
    return {"job_id": str(job.id), "status": "queued"}


@router.post("/tasks/{task_id}/submit")
def submit_output(task_id: uuid.UUID, body: SubmitIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    """Submit an output produced elsewhere (any agent runtime). It is verified exactly like a live run."""
    ctx.require("member")
    if body.idempotency_key:
        previous = db.scalar(select(Run).where(Run.idempotency_key == body.idempotency_key))
        if previous is not None:
            if previous.task_id != task_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency key already used for another task.")
            return get_task(task_id, ctx, db)
    task = _task(db, ctx.company.id, task_id, lock=True)
    if task.is_demo:
        raise HTTPException(status.HTTP_409_CONFLICT, "Demo tasks cannot receive submissions.")
    if task.status in ("done", "cancelled", "awaiting_approval"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Task is {task.status.replace('_', ' ')}.")
    if task.assignee_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Assign the task to an agent before submitting its output.")
    agent = db.get(Agent, task.assignee_id)
    if agent is None or agent.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "The assigned agent is not active.")
    if ctx.company.emergency_stop:
        raise HTTPException(status.HTTP_409_CONFLICT, "Emergency stop is on.")
    run = new_run(db, task, "submitted", idempotency_key=body.idempotency_key)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "run.submitted",
        "task",
        task.id,
        f"Output submitted for T-{task.number} on behalf of {agent.name}",
        {"run_id": str(run.id)},
    )
    try:
        result = process_output(db, task, run, body.output, Actor("agent", str(agent.id), agent.name))
    except PipelineError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    task.version += 1
    db.commit()
    return {**get_task(task_id, ctx, db), "outcome": result.status}


@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: uuid.UUID, body: NoteIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    task = _task(db, ctx.company.id, task_id, lock=True)
    if task.status in ("done", "cancelled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Task is already {task.status}.")
    db.execute(
        update(Job)
        .where(Job.kind == "run_task", Job.status == "queued", Job.payload["task_id"].as_string() == str(task.id))
        .values(status="cancelled")
    )
    db.execute(
        update(Approval)
        .where(Approval.task_id == task.id, Approval.status == "pending")
        .values(status="superseded", note="task cancelled")
    )
    task.status = "cancelled"
    task.version += 1
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "task.cancelled",
        "task",
        task.id,
        f"T-{task.number} cancelled" + (f": {body.note}" if body.note else ""),
    )
    db.commit()
    return get_task(task_id, ctx, db)


@router.post("/tasks/{task_id}/report-problem")
def report(task_id: uuid.UUID, body: NoteIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    task = _task(db, ctx.company.id, task_id, lock=True)
    try:
        report_problem(db, task, body.note, ctx.principal.actor)
    except PipelineError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.commit()
    return get_task(task_id, ctx, db)


# ---------------------------------------------------------------- approvals


def _approval_view(db: DbDep, approval: Approval) -> dict[str, Any]:
    task = db.get(Task, approval.task_id)
    agent = db.get(Agent, approval.agent_id) if approval.agent_id else None
    receipt = db.get(ReceiptRow, approval.receipt_id) if approval.receipt_id else None
    return approval_out(approval, task, agent, receipt)


@router.get("/approvals")
def list_approvals(
    ctx: CompanyDep,
    db: DbDep,
    status_filter: str = Query(default="pending", alias="status", pattern="^(pending|decided|all)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    query = select(Approval).where(Approval.company_id == ctx.company.id)
    if status_filter == "pending":
        query = query.where(Approval.status == "pending")
    elif status_filter == "decided":
        query = query.where(Approval.status != "pending")
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = Approval.created_at.asc() if status_filter == "pending" else Approval.decided_at.desc()
    rows = db.scalars(query.order_by(order).limit(limit).offset(offset)).all()
    return {"items": [_approval_view(db, a) for a in rows], "total": total}


@router.get("/approvals/{approval_id}")
def get_approval(approval_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    approval = db.get(Approval, approval_id)
    if approval is None or approval.company_id != ctx.company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approval not found.")
    return _approval_view(db, approval)


@router.post("/approvals/{approval_id}/decide")
def decide_approval(approval_id: uuid.UUID, body: DecisionIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    approval = db.scalar(
        select(Approval).where(Approval.id == approval_id, Approval.company_id == ctx.company.id).with_for_update()
    )
    if approval is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approval not found.")
    try:
        decide(db, approval, body.decision, body.note, ctx.principal.actor)
    except PipelineError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    task = db.get(Task, approval.task_id)
    if body.decision == "changes_requested" and task is not None and not task.is_demo:
        agent = db.get(Agent, task.assignee_id) if task.assignee_id else None
        if agent is not None and agent.provider and agent.model:
            try:
                runner.check_can_run(db, ctx.company, agent)
                jobs.enqueue(db, "run_task", {"task_id": str(task.id)}, company_id=ctx.company.id)
            except runner.RunRefused as exc:
                db.add(
                    TaskComment(
                        task_id=task.id,
                        author_type="system",
                        author_id="select",
                        author_name="Select",
                        body=f"The correction did not start automatically: {exc}",
                    )
                )
        # An agent driven from outside picks the task up again through the submission API.
    if task is not None:
        task.version += 1
    db.commit()
    return _approval_view(db, approval)


# ---------------------------------------------------------------- receipts


@router.get("/receipts")
def list_receipts(
    ctx: CompanyDep,
    db: DbDep,
    status_filter: str | None = Query(default=None, alias="status", pattern="^(verified|failed|blocked)$"),
    contract: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    query = select(ReceiptRow).where(ReceiptRow.company_id == ctx.company.id)
    if status_filter:
        query = query.where(ReceiptRow.status == status_filter)
    if contract:
        query = query.where(ReceiptRow.contract_id == contract)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(ReceiptRow.created_at.desc()).limit(limit).offset(offset)).all()
    tasks = {t.id: t for t in db.scalars(select(Task).where(Task.id.in_([r.task_id for r in rows])))}
    agents = {a.id: a for a in db.scalars(select(Agent).where(Agent.company_id == ctx.company.id))}
    items = []
    for r in rows:
        t = tasks.get(r.task_id)
        a = agents.get(r.agent_id) if r.agent_id else None
        items.append(
            {
                **receipt_out(r),
                "task_key": f"T-{t.number}" if t else None,
                "task_title": t.title if t else None,
                "agent_name": a.name if a else None,
            }
        )
    return {"items": items, "total": total}


@router.get("/receipts/{receipt_id}")
def get_receipt(receipt_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    row = db.get(ReceiptRow, receipt_id)
    if row is None or row.company_id != ctx.company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt not found.")
    task = db.get(Task, row.task_id)
    return {
        **receipt_out(row),
        "task_key": f"T-{task.number}" if task else None,
        "task_title": task.title if task else None,
    }
