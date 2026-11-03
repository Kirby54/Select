"""Overview, inbox, autonomy, verification contracts, costs, activity and search."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select

from . import autonomy
from .audit import record
from .auth import CompanyDep, DbDep
from .contracts import contract_summary, get_contract, registry
from .models import Agent, Approval, AuditEvent, CostEvent, Outcome, ReceiptRow, Task, Trust, TrustEvent
from .runner import month_spend
from .views import NoteIn, audit_out, task_out, trust_event_out, trust_out

router = APIRouter(prefix="/api/companies/{company_id}")


def _since(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


@router.get("/overview")
def overview(ctx: CompanyDep, db: DbDep, days: int = Query(default=7, ge=1, le=365)) -> dict[str, Any]:
    cid = ctx.company.id
    since = _since(days)
    agents = db.scalars(select(Agent).where(Agent.company_id == cid, Agent.status != "archived")).all()
    task_counts = dict(
        db.execute(
            select(Task.status, func.count())
            .where(Task.company_id == cid, Task.archived_at.is_(None))
            .group_by(Task.status)
        ).all()
    )
    pending = db.scalar(select(func.count()).where(Approval.company_id == cid, Approval.status == "pending")) or 0
    receipts = dict(
        db.execute(
            select(ReceiptRow.status, func.count())
            .where(ReceiptRow.company_id == cid, ReceiptRow.created_at >= since)
            .group_by(ReceiptRow.status)
        ).all()
    )
    cost_rows = db.execute(
        select(CostEvent.is_demo, func.coalesce(func.sum(CostEvent.amount), 0))
        .where(CostEvent.company_id == cid, CostEvent.created_at >= since)
        .group_by(CostEvent.is_demo)
    ).all()
    costs = {bool(d): Decimal(str(a)) for d, a in cost_rows}
    spent_month = month_spend(db, cid)
    budget = ctx.company.monthly_budget
    # Daily series of outcomes for the chart: finished vs finished without a human.
    outcomes = db.scalars(select(Outcome).where(Outcome.company_id == cid, Outcome.created_at >= since)).all()
    series: dict[str, dict[str, int]] = {}
    for o in outcomes:
        day = o.created_at.date().isoformat()
        slot = series.setdefault(day, {"finished": 0, "autonomous": 0, "errors": 0})
        slot["finished"] += 1
        slot["autonomous"] += int(o.autonomous)
        slot["errors"] += int(o.undetected_error)
    recent = db.scalars(
        select(AuditEvent).where(AuditEvent.company_id == cid).order_by(AuditEvent.created_at.desc()).limit(12)
    ).all()
    return {
        "period_days": days,
        "is_demo": ctx.company.is_demo,
        "emergency_stop": ctx.company.emergency_stop,
        "agents": {
            "total": len(agents),
            "active": sum(a.status == "active" for a in agents),
            "paused": sum(a.status == "paused" for a in agents),
        },
        "tasks": {
            "in_progress": task_counts.get("in_progress", 0),
            "blocked": task_counts.get("blocked", 0),
            "awaiting_approval": task_counts.get("awaiting_approval", 0),
            "todo": task_counts.get("todo", 0),
            "done": task_counts.get("done", 0),
        },
        "approvals_pending": pending,
        "receipts": {
            "verified": receipts.get("verified", 0),
            "failed": receipts.get("failed", 0),
            "blocked": receipts.get("blocked", 0),
        },
        "autonomy": autonomy.counter(db, cid, days),
        "levels": autonomy.level_counts(db, cid),
        "costs": {
            "period_live": format(costs.get(False, Decimal("0")), "f"),
            "period_demo": format(costs.get(True, Decimal("0")), "f"),
            "month_live": format(spent_month, "f"),
            "monthly_budget": format(budget, "f"),
            "budget_remaining": format(max(budget - spent_month, Decimal("0")), "f") if budget > 0 else None,
            "kind": "estimated",
        },
        "series": [{"day": d, **v} for d, v in sorted(series.items())],
        "recent": [audit_out(e) for e in recent],
    }


@router.get("/inbox")
def inbox(ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    cid = ctx.company.id
    approvals = db.scalars(
        select(Approval).where(Approval.company_id == cid, Approval.status == "pending").order_by(Approval.created_at)
    ).all()
    blocked = db.scalars(
        select(Task)
        .where(Task.company_id == cid, Task.status == "blocked", Task.archived_at.is_(None))
        .order_by(Task.updated_at.desc())
        .limit(50)
    ).all()
    demotions = db.scalars(
        select(TrustEvent)
        .where(
            TrustEvent.company_id == cid, TrustEvent.kind.in_(("demote", "revoke")), TrustEvent.created_at >= _since(7)
        )
        .order_by(TrustEvent.created_at.desc())
        .limit(20)
    ).all()
    agents = {a.id: a for a in db.scalars(select(Agent).where(Agent.company_id == cid))}
    tasks = {t.id: t for t in db.scalars(select(Task).where(Task.id.in_([a.task_id for a in approvals])))}
    items: list[dict[str, Any]] = []
    for a in approvals:
        t = tasks.get(a.task_id)
        items.append(
            {
                "kind": "approval",
                "id": str(a.id),
                "title": f"Approve {t.title if t else 'task'}",
                "detail": f"{agents[a.agent_id].name if a.agent_id in agents else 'Agent'} · "
                f"{a.reason.replace('_', ' ')}",
                "task_id": str(a.task_id),
                "created_at": a.created_at.isoformat(),
                "is_demo": a.is_demo,
            }
        )
    for t in blocked:
        items.append(
            {
                "kind": "blocked",
                "id": str(t.id),
                "title": f"T-{t.number} is blocked",
                "detail": t.title,
                "task_id": str(t.id),
                "created_at": t.updated_at.isoformat(),
                "is_demo": t.is_demo,
            }
        )
    for e in demotions:
        name = agents[e.agent_id].name if e.agent_id in agents else "Agent"
        items.append(
            {
                "kind": "demotion",
                "id": str(e.id),
                "title": f"{name} lost autonomy on {e.task_type}",
                "detail": e.reason,
                "agent_id": str(e.agent_id),
                "created_at": e.created_at.isoformat(),
                "is_demo": e.is_demo,
            }
        )
    return {
        "items": items,
        "counts": {"approvals": len(approvals), "blocked": len(blocked), "demotions": len(demotions)},
    }


@router.get("/autonomy")
def autonomy_view(ctx: CompanyDep, db: DbDep, days: int = Query(default=7, ge=1, le=365)) -> dict[str, Any]:
    cid = ctx.company.id
    agents = {a.id: a for a in db.scalars(select(Agent).where(Agent.company_id == cid))}
    trusts = db.scalars(select(Trust).where(Trust.company_id == cid).order_by(Trust.task_type)).all()
    events = db.scalars(
        select(TrustEvent).where(TrustEvent.company_id == cid).order_by(TrustEvent.created_at.desc()).limit(100)
    ).all()
    policy = autonomy.policy_for(ctx.company)
    caps = {cid_: autonomy.risk_cap(c, policy) for cid_, c in registry().items()}
    licences = []
    for t in trusts:
        agent = agents.get(t.agent_id)
        contract = get_contract(t.task_type)
        threshold = policy["promote_after"].get(t.level)
        licences.append(
            {
                **trust_out(t),
                "agent_name": agent.name if agent else None,
                "agent_role": agent.role if agent else None,
                "cap": caps.get(t.task_type, "supervised"),
                "risk": contract.risk if contract else None,
                "next_threshold": threshold if t.level != "autonomous" and not t.frozen else None,
                "promotion_blocked": bool(
                    contract and autonomy.rank(t.level) >= autonomy.rank(caps.get(t.task_type, "supervised"))
                ),
            }
        )
    return {
        "counter": autonomy.counter(db, cid, days),
        "levels": autonomy.level_counts(db, cid),
        "policy": policy,
        "legal_cap": "supervised",
        "caps": caps,
        "licences": licences,
        "events": [trust_event_out(e, agents[e.agent_id].name if e.agent_id in agents else None) for e in events],
    }


def _trust(db: DbDep, company_id: uuid.UUID, trust_id: uuid.UUID) -> Trust:
    trust = db.scalar(select(Trust).where(Trust.id == trust_id, Trust.company_id == company_id).with_for_update())
    if trust is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licence not found.")
    return trust


@router.post("/autonomy/{trust_id}/revoke")
def revoke(trust_id: uuid.UUID, body: NoteIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    """Immediate: the next result of this agent on this task type goes to a human."""
    ctx.require("member")
    trust = _trust(db, ctx.company.id, trust_id)
    event = autonomy.revoke(db, trust, ctx.principal.actor, body.note)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "autonomy.revoked",
        "agent",
        trust.agent_id,
        event.reason,
        {"task_type": trust.task_type},
    )
    db.commit()
    return trust_out(trust)


@router.post("/autonomy/{trust_id}/unfreeze")
def unfreeze(trust_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    trust = _trust(db, ctx.company.id, trust_id)
    if not trust.frozen:
        raise HTTPException(status.HTTP_409_CONFLICT, "This licence is not frozen.")
    event = autonomy.unfreeze(db, trust, ctx.principal.actor)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "autonomy.unfrozen",
        "agent",
        trust.agent_id,
        event.reason,
        {"task_type": trust.task_type},
    )
    db.commit()
    return trust_out(trust)


@router.get("/contracts")
def contracts(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    stats = db.execute(
        select(ReceiptRow.contract_id, ReceiptRow.status, func.count())
        .where(ReceiptRow.company_id == ctx.company.id)
        .group_by(ReceiptRow.contract_id, ReceiptRow.status)
    ).all()
    by_contract: dict[str, dict[str, int]] = {}
    for contract_id, st, n in stats:
        by_contract.setdefault(contract_id, {})[st] = n
    policy = autonomy.policy_for(ctx.company)
    return [
        {**contract_summary(c), "cap": autonomy.risk_cap(c, policy), "receipts": by_contract.get(c.id, {})}
        for c in registry().values()
    ]


@router.get("/costs")
def costs(
    ctx: CompanyDep, db: DbDep, days: int = Query(default=30, ge=1, le=365), include_demo: bool = True
) -> dict[str, Any]:
    cid = ctx.company.id
    base = [CostEvent.company_id == cid, CostEvent.created_at >= _since(days)]
    if not include_demo:
        base.append(CostEvent.is_demo.is_(False))

    def grouped(column: Any) -> list[tuple[Any, Decimal, int, int, int]]:
        rows = db.execute(
            select(
                column,
                func.coalesce(func.sum(CostEvent.amount), 0),
                func.count(),
                func.coalesce(func.sum(CostEvent.input_tokens), 0),
                func.coalesce(func.sum(CostEvent.output_tokens), 0),
            )
            .where(*base)
            .group_by(column)
        ).all()
        return [(k, Decimal(str(a)), n, i, o) for k, a, n, i, o in rows]

    agents = {a.id: a.name for a in db.scalars(select(Agent).where(Agent.company_id == cid))}
    total = sum((a for _k, a, _n, _i, _o in grouped(CostEvent.kind)), Decimal("0"))
    verified = (
        db.scalar(
            select(func.count()).where(
                Outcome.company_id == cid,
                Outcome.verified.is_(True),
                Outcome.undetected_error.is_(False),
                Outcome.created_at >= _since(days),
            )
        )
        or 0
    )
    daily = db.execute(
        select(func.date(CostEvent.created_at), func.coalesce(func.sum(CostEvent.amount), 0))
        .where(*base)
        .group_by(func.date(CostEvent.created_at))
        .order_by(func.date(CostEvent.created_at))
    ).all()

    def fmt_rows(rows: list[tuple[Any, Decimal, int, int, int]], label: Any) -> list[dict[str, Any]]:
        return sorted(
            (
                {
                    "key": str(k) if k is not None else None,
                    "label": label(k),
                    "amount": format(a, "f"),
                    "events": n,
                    "input_tokens": i,
                    "output_tokens": o,
                }
                for k, a, n, i, o in rows
            ),
            key=lambda r: Decimal(r["amount"]),
            reverse=True,
        )

    task_rows = grouped(CostEvent.task_id)
    tasks = {t.id: t for t in db.scalars(select(Task).where(Task.id.in_([k for k, *_ in task_rows if k])))}
    budget = ctx.company.monthly_budget
    spent = month_spend(db, cid)
    alerts = []
    if budget > 0 and spent >= budget:
        alerts.append({"level": "critical", "message": "Monthly budget reached: live runs are stopped."})
    elif budget > 0 and spent >= budget * Decimal("0.8"):
        alerts.append({"level": "warning", "message": "80 % of the monthly budget is used."})
    return {
        "period_days": days,
        "currency": "USD (provider prices)",
        "total": format(total, "f"),
        "kind_note": "Token counts come from providers; amounts are estimated from the price table in Connections.",
        "verified_results": verified,
        "cost_per_verified_result": format(total / verified, ".6f") if verified else None,
        "by_kind": fmt_rows(grouped(CostEvent.kind), lambda k: k),
        "by_agent": fmt_rows(grouped(CostEvent.agent_id), lambda k: agents.get(k, "Unassigned")),
        "by_provider": fmt_rows(grouped(CostEvent.provider), lambda k: k),
        "by_model": fmt_rows(grouped(CostEvent.model), lambda k: k),
        "by_project": fmt_rows(grouped(CostEvent.project_id), lambda k: str(k) if k else "No project"),
        "by_task": fmt_rows(task_rows, lambda k: f"T-{tasks[k].number} {tasks[k].title}" if k in tasks else "—")[:20],
        "daily": [{"day": str(d), "amount": format(Decimal(str(a)), "f")} for d, a in daily],
        "budget": {"monthly": format(budget, "f"), "spent_live_this_month": format(spent, "f")},
        "alerts": alerts,
    }


def _activity_query(cid: uuid.UUID, kind: str | None, actor: str | None, q: str | None, entity: str | None) -> Any:
    query = select(AuditEvent).where(AuditEvent.company_id == cid)
    if kind:
        query = query.where(AuditEvent.kind.startswith(kind))
    if actor:
        query = query.where(AuditEvent.actor_type == actor)
    if entity:
        query = query.where(AuditEvent.entity_id == entity)
    if q:
        query = query.where(or_(AuditEvent.summary.ilike(f"%{q}%"), AuditEvent.actor_name.ilike(f"%{q}%")))
    return query


@router.get("/activity")
def activity(
    ctx: CompanyDep,
    db: DbDep,
    kind: str | None = Query(default=None, max_length=48),
    actor: str | None = Query(default=None, pattern="^(user|agent|system|demo)$"),
    q: str | None = Query(default=None, max_length=100),
    entity: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    query = _activity_query(ctx.company.id, kind, actor, q, entity)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(AuditEvent.created_at.desc()).limit(limit).offset(offset)).all()
    return {"items": [audit_out(e) for e in rows], "total": total}


@router.get("/activity/export")
def activity_export(
    ctx: CompanyDep, db: DbDep, kind: str | None = None, actor: str | None = None, q: str | None = None
) -> StreamingResponse:
    rows = db.scalars(
        _activity_query(ctx.company.id, kind, actor, q, None).order_by(AuditEvent.created_at.desc()).limit(10_000)
    ).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["created_at", "actor_type", "actor", "kind", "entity_type", "entity_id", "summary", "demo"])
    for e in rows:
        writer.writerow(
            [
                e.created_at.isoformat(),
                e.actor_type,
                e.actor_name,
                e.kind,
                e.entity_type,
                e.entity_id,
                e.summary,
                e.is_demo,
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="select-activity.csv"'},
    )


@router.get("/search")
def search(ctx: CompanyDep, db: DbDep, q: str = Query(min_length=1, max_length=100)) -> dict[str, Any]:
    like = f"%{q}%"
    cid = ctx.company.id
    conditions = [Task.title.ilike(like)]
    if q.upper().startswith("T-") and q[2:].isdigit():
        conditions.append(Task.number == int(q[2:]))
    tasks = db.scalars(
        select(Task).where(Task.company_id == cid, or_(*conditions)).order_by(Task.updated_at.desc()).limit(8)
    ).all()
    agents = db.scalars(
        select(Agent).where(Agent.company_id == cid, or_(Agent.name.ilike(like), Agent.role.ilike(like))).limit(6)
    ).all()
    return {
        "tasks": [task_out(t) for t in tasks],
        "agents": [{"id": str(a.id), "name": a.name, "role": a.role, "status": a.status} for a in agents],
    }
