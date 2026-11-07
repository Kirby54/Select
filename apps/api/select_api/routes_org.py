"""Companies, members, agents, organization, goals and projects."""

from __future__ import annotations

import re
import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from . import autonomy, capabilities, delivery, jobs
from .audit import record
from .auth import CompanyDep, DbDep, PrincipalDep
from .company_profile import COUNTRIES, normalize_rates, rate_allowed, validate_settings, validate_timezone
from .config import get_settings
from .contracts import registry
from .models import (
    Agent,
    Company,
    CostEvent,
    Goal,
    Membership,
    Project,
    ProviderConnection,
    Run,
    Task,
    Trust,
    TrustEvent,
    User,
)
from .views import (
    AgentIn,
    AgentPatch,
    CatalogItemIn,
    CapabilityCheckIn,
    CapabilityGrantIn,
    CompanyIn,
    CompanyPatch,
    GoalIn,
    ProjectIn,
    UserIn,
    agent_out,
    company_out,
    goal_out,
    money,
    project_out,
    run_out,
    task_out,
    trust_event_out,
)

router = APIRouter(prefix="/api")


def _rate(value: str) -> str:
    rates, _ = normalize_rates([value])
    return rates[0] if rates else value


def _slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "company"
    return f"{base}-{uuid.uuid4().hex[:6]}"


@router.get("/companies")
def list_companies(principal: PrincipalDep, db: DbDep) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Company, Membership.role)
        .join(Membership, Membership.company_id == Company.id)
        .where(Membership.user_id == principal.user_id)
        .order_by(Company.is_demo, Company.created_at)
    ).all()
    return [company_out(c, role) for c, role in rows]


def _profile_errors(country: str, currency: str | None, rates: list[str] | None, tz: str | None) -> list[str]:
    errors = []
    if country not in COUNTRIES and (currency is None or rates is None or tz is None):
        errors.append(f"{country} has no preset: give the currency, the VAT rates and the time zone")
    if tz is not None and (error := validate_timezone(tz)):
        errors.append(error)
    return errors


@router.post("/companies", status_code=201)
def create_company(body: CompanyIn, principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    errors = _profile_errors(body.country, body.currency, body.vat_rates, body.timezone)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(errors))
    preset = COUNTRIES.get(body.country)
    currency = body.currency or (preset.currency if preset else "EUR")
    timezone = body.timezone or (preset.timezone if preset else "UTC")
    rates, rate_errors = normalize_rates(
        body.vat_rates if body.vat_rates is not None else list(preset.vat_rates if preset else ())
    )
    if rate_errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(rate_errors))
    company = Company(
        name=body.name,
        slug=_slug(body.name),
        country=body.country,
        currency=currency,
        vat_rates=rates,
        timezone=timezone,
        language=body.language or (preset.language if preset else "en"),
        monthly_budget=body.monthly_budget,
        policy={},
        catalog=[],
        settings={},
    )
    db.add(company)
    db.flush()
    db.add(Membership(company_id=company.id, user_id=principal.user_id, role="owner"))
    record(db, company.id, principal.actor, "company.created", "company", company.id, f"Company {company.name} created")
    db.commit()
    return company_out(company, "owner")


@router.get("/companies/{company_id}")
def get_company(ctx: CompanyDep) -> dict[str, Any]:
    return company_out(ctx.company, ctx.role)


@router.patch("/companies/{company_id}")
def patch_company(body: CompanyPatch, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    company = db.get(Company, ctx.company.id)
    assert company is not None
    changes: dict[str, Any] = {}
    if body.name is not None:
        company.name = body.name
        changes["name"] = body.name
    if body.monthly_budget is not None:
        company.monthly_budget = body.monthly_budget
        changes["monthly_budget"] = money(body.monthly_budget)
    if body.policy is not None:
        errors = autonomy.validate_policy(body.policy)
        if errors:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(errors))
        company.policy = body.policy
        changes["policy"] = body.policy
    if body.country is not None and body.country != company.country:
        company.country = body.country
        changes["country"] = body.country
    if body.currency is not None and body.currency != company.currency:
        company.currency = body.currency
        changes["currency"] = body.currency
    if body.timezone is not None and body.timezone != company.timezone:
        if error := validate_timezone(body.timezone):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, error)
        company.timezone = body.timezone
        changes["timezone"] = body.timezone
    if body.language is not None and body.language != company.language:
        company.language = body.language
        changes["language"] = body.language
    if body.vat_rates is not None:
        rates, rate_errors = normalize_rates(body.vat_rates)
        unused = [i["ref"] for i in company.catalog or [] if not rate_allowed(str(i.get("vat_rate", "")), rates)]
        if unused:
            rate_errors.append(f"catalog item(s) {', '.join(unused)} use a rate that would no longer exist")
        if rate_errors:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(rate_errors))
        if rates != (company.vat_rates or []):
            company.vat_rates = rates
            changes["vat_rates"] = rates
    if body.settings is not None:
        errors = validate_settings(body.settings, set(registry()))
        if errors:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(errors))
        company.settings = {**(company.settings or {}), **body.settings}
        changes["settings"] = body.settings
    record(
        db,
        company.id,
        ctx.principal.actor,
        "company.updated",
        "company",
        company.id,
        "Company settings changed: " + ", ".join(changes) if changes else "No change",
        changes,
    )
    db.commit()
    return company_out(company, ctx.role)


@router.put("/companies/{company_id}/catalog")
def put_catalog(body: list[CatalogItemIn], ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    refs = [i.ref for i in body]
    if len(refs) != len(set(refs)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Catalog references must be unique.")
    company = db.get(Company, ctx.company.id)
    assert company is not None
    wrong = [f"{i.ref} ({i.vat_rate})" for i in body if not rate_allowed(i.vat_rate, company.vat_rates or [])]
    if wrong:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"VAT rate not used by this company for: {', '.join(wrong)}. "
            f"Company rates: {', '.join(company.vat_rates or [])} (change them in Settings).",
        )
    company.catalog = [
        {**i.model_dump(mode="json"), "unit_price": format(i.unit_price, "f"), "vat_rate": _rate(i.vat_rate)}
        for i in body
    ]
    record(
        db,
        company.id,
        ctx.principal.actor,
        "catalog.updated",
        "company",
        company.id,
        f"Catalog replaced ({len(body)} items)",
    )
    db.commit()
    return company_out(company, ctx.role)


@router.post("/companies/{company_id}/emergency-stop")
def emergency_stop(ctx: CompanyDep, db: DbDep, on: bool = True) -> dict[str, Any]:
    ctx.require("member")
    company = db.get(Company, ctx.company.id)
    assert company is not None
    company.emergency_stop = on
    cancelled = jobs.cancel_company_jobs(db, company.id) if on else 0
    held = delivery.hold_all(db, company.id, "Emergency stop: a person releases it.") if on else 0
    record(
        db,
        company.id,
        ctx.principal.actor,
        "company.emergency_stop",
        "company",
        company.id,
        f"Emergency stop {'ON' if on else 'off'}"
        + (f"; {cancelled} queued job(s) cancelled, {held} e-mail(s) held" if on else ""),
    )
    db.commit()
    return company_out(company, ctx.role)


@router.get("/companies/{company_id}/members")
def list_members(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    rows = db.execute(
        select(User, Membership.role)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.company_id == ctx.company.id)
        .order_by(User.created_at)
    ).all()
    return [
        {"id": str(u.id), "email": u.email, "name": u.name, "role": r, "is_you": u.id == ctx.principal.user_id}
        for u, r in rows
    ]


@router.post("/companies/{company_id}/members", status_code=201)
def add_member(body: UserIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("owner")
    if get_settings().auth_mode == "password":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "With sign-in by password, invite people instead: they choose their own password."
        )
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None:
        user = User(email=body.email, name=body.name)
        db.add(user)
        db.flush()
    existing = db.scalar(
        select(Membership).where(Membership.company_id == ctx.company.id, Membership.user_id == user.id)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "This person is already a member.")
    db.add(Membership(company_id=ctx.company.id, user_id=user.id, role=body.role))
    record(
        db, ctx.company.id, ctx.principal.actor, "member.added", "user", user.id, f"{body.email} added as {body.role}"
    )
    db.commit()
    return {"id": str(user.id), "email": user.email, "name": user.name, "role": body.role}


# ---------------------------------------------------------------- agents


def _agent(db: DbDep, company_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    agent = db.get(Agent, agent_id)
    if agent is None or agent.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found.")
    return agent


def _connected_providers(db: DbDep, company_id: uuid.UUID) -> set[str]:
    rows = db.scalars(
        select(ProviderConnection).where(
            ProviderConnection.company_id == company_id, ProviderConnection.enabled.is_(True)
        )
    ).all()
    return {c.provider for c in rows if c.secret_encrypted or c.provider == "ollama"}


def _check_task_types(task_types: list[str]) -> None:
    unknown = sorted(set(task_types) - set(registry()))
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Unknown task type(s): {', '.join(unknown)}. Known: {', '.join(sorted(registry()))}.",
        )


def _check_manager(db: DbDep, company_id: uuid.UUID, agent_id: uuid.UUID | None, manager_id: uuid.UUID) -> None:
    manager = _agent(db, company_id, manager_id)
    seen = {agent_id} if agent_id else set()
    current: Agent | None = manager
    while current is not None:
        if current.id in seen:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That reporting line would create a loop.")
        seen.add(current.id)
        current = db.get(Agent, current.manager_id) if current.manager_id else None


def _working(db: DbDep, company_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """Runs queued or running per agent: the agents at work right now."""
    rows = db.execute(
        select(Run.agent_id, func.count())
        .where(Run.company_id == company_id, Run.status.in_(("queued", "running")), Run.agent_id.is_not(None))
        .group_by(Run.agent_id)
    ).all()
    return {agent_id: int(count) for agent_id, count in rows}


@router.get("/companies/{company_id}/agents")
def list_agents(ctx: CompanyDep, db: DbDep, include_archived: bool = False) -> list[dict[str, Any]]:
    query = select(Agent).where(Agent.company_id == ctx.company.id).order_by(Agent.position, Agent.created_at)
    if not include_archived:
        query = query.where(Agent.status != "archived")
    agents = db.scalars(query).all()
    trusts = db.scalars(select(Trust).where(Trust.company_id == ctx.company.id)).all()
    providers = _connected_providers(db, ctx.company.id)
    working = _working(db, ctx.company.id)
    return [
        agent_out(
            a,
            [t for t in trusts if t.agent_id == a.id],
            connected=bool(a.provider and a.model and a.provider in providers),
            working=working.get(a.id, 0),
        )
        for a in agents
    ]


@router.post("/companies/{company_id}/agents", status_code=201)
def create_agent(body: AgentIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    _check_task_types(body.task_types)
    if body.manager_id:
        _check_manager(db, ctx.company.id, None, body.manager_id)
    position = (
        int(db.scalar(select(func.coalesce(func.max(Agent.position), -1)).where(Agent.company_id == ctx.company.id)))
        + 1
    )
    agent = Agent(company_id=ctx.company.id, position=position, **body.model_dump())
    db.add(agent)
    db.flush()
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "agent.created",
        "agent",
        agent.id,
        f"Agent {agent.name} ({agent.role}) created",
        {"task_types": agent.task_types, "permissions": agent.permissions},
    )
    db.commit()
    return agent_out(
        agent, [], connected=bool(agent.provider and agent.provider in _connected_providers(db, ctx.company.id))
    )


@router.get("/companies/{company_id}/agents/{agent_id}")
def get_agent(agent_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    agent = _agent(db, ctx.company.id, agent_id)
    trusts = db.scalars(select(Trust).where(Trust.agent_id == agent.id)).all()
    events = db.scalars(
        select(TrustEvent).where(TrustEvent.agent_id == agent.id).order_by(TrustEvent.created_at.desc()).limit(50)
    ).all()
    runs = db.scalars(select(Run).where(Run.agent_id == agent.id).order_by(Run.created_at.desc()).limit(25)).all()
    tasks = db.scalars(
        select(Task)
        .where(Task.assignee_id == agent.id, Task.archived_at.is_(None))
        .order_by(Task.updated_at.desc())
        .limit(50)
    ).all()
    cost = db.execute(
        select(CostEvent.kind, func.coalesce(func.sum(CostEvent.amount), 0), func.count())
        .where(CostEvent.agent_id == agent.id)
        .group_by(CostEvent.kind)
    ).all()
    providers = _connected_providers(db, ctx.company.id)
    return {
        **agent_out(
            agent,
            list(trusts),
            connected=bool(agent.provider and agent.model and agent.provider in providers),
            working=_working(db, ctx.company.id).get(agent.id, 0),
        ),
        "trust_events": [trust_event_out(e, agent.name) for e in events],
        "runs": [run_out(r) for r in runs],
        "tasks": [task_out(t, agent) for t in tasks],
        "costs": [{"kind": k, "amount": format(Decimal(str(a)), "f"), "events": n} for k, a, n in cost],
        "contracts": sorted(agent.task_types or []),
    }


@router.get("/companies/{company_id}/agents/{agent_id}/capabilities")
def agent_capabilities(agent_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    agent = _agent(db, ctx.company.id, agent_id)
    return {
        "grants": capabilities.grants(agent),
        "limits": {
            "type": "code_change", "external_effects": "human approval only",
            "cannot": ["send_customer_email", "modify_production", "other_repositories"],
        },
    }


@router.post("/companies/{company_id}/agents/{agent_id}/capabilities", status_code=201)
def grant_capability(
    agent_id: uuid.UUID, body: CapabilityGrantIn, ctx: CompanyDep, db: DbDep
) -> dict[str, Any]:
    ctx.require("admin")
    agent = db.scalar(
        select(Agent).where(Agent.id == agent_id, Agent.company_id == ctx.company.id).with_for_update()
    )
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found.")
    try:
        grant = capabilities.issue(agent, body.scope, ctx.principal.actor.name, body.days)
    except capabilities.CapabilityDenied as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    record(
        db, ctx.company.id, ctx.principal.actor, "capability.granted", "agent", agent.id,
        f"Review-only code proposal grant for {body.scope}, expires in {body.days} days",
        {"grant_id": grant["id"], "scope": body.scope, "contract_sha256": grant["contract_sha256"]},
    )
    db.commit()
    return {**grant, "status": "active"}


@router.post("/companies/{company_id}/agents/{agent_id}/capabilities/{grant_id}/revoke")
def revoke_capability(
    agent_id: uuid.UUID, grant_id: uuid.UUID, ctx: CompanyDep, db: DbDep
) -> dict[str, Any]:
    ctx.require("admin")
    agent = db.scalar(
        select(Agent).where(Agent.id == agent_id, Agent.company_id == ctx.company.id).with_for_update()
    )
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found.")
    try:
        grant = capabilities.revoke(agent, grant_id, ctx.principal.actor.name)
    except capabilities.CapabilityDenied as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    record(
        db, ctx.company.id, ctx.principal.actor, "capability.revoked", "agent", agent.id,
        f"Revoked review-only code proposal grant for {grant['scope']}",
        {"grant_id": str(grant_id), "scope": grant["scope"]},
    )
    db.commit()
    return {**grant, "status": "revoked"}


@router.post("/companies/{company_id}/agents/{agent_id}/capabilities/check")
def check_capability(
    agent_id: uuid.UUID, body: CapabilityCheckIn, ctx: CompanyDep, db: DbDep
) -> dict[str, Any]:
    """Read-only diagnostic: makes DENIED boundaries demonstrable without performing an action."""
    agent = _agent(db, ctx.company.id, agent_id)
    try:
        if body.action != "code_change":
            raise capabilities.CapabilityDenied(
                f"{body.action} is not grantable by verified task successes or code proposal grants."
            )
        grant = capabilities.require(agent, body.action, body.scope)
        return {"allowed": True, "scope": body.scope, "action": body.action, "grant_id": grant["id"]}
    except capabilities.CapabilityDenied as exc:
        return {"allowed": False, "scope": body.scope, "action": body.action, "reason": str(exc)}


@router.patch("/companies/{company_id}/agents/{agent_id}")
def patch_agent(agent_id: uuid.UUID, body: AgentPatch, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    agent = _agent(db, ctx.company.id, agent_id)
    if body.version != agent.version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Someone changed this agent since you opened it. Reload to see their changes.",
                "current": agent_out(agent),
            },
        )
    data = body.model_dump(exclude_unset=True, exclude={"version", "clear_manager"})
    if "task_types" in data:
        _check_task_types(data["task_types"])
    if body.clear_manager:
        data["manager_id"] = None
    elif data.get("manager_id"):
        if data["manager_id"] == agent.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "An agent cannot manage itself.")
        _check_manager(db, ctx.company.id, agent.id, data["manager_id"])
    before = {k: getattr(agent, k) for k in data}
    for key, value in data.items():
        setattr(agent, key, value)
    agent.version += 1
    changed = {k: {"from": str(before[k]), "to": str(v)} for k, v in data.items() if before[k] != v}
    kind = "agent.permissions_changed" if "permissions" in changed else "agent.updated"
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        kind,
        "agent",
        agent.id,
        f"Agent {agent.name} updated: {', '.join(changed) or 'no change'}",
        changed,
    )
    db.commit()
    return get_agent(agent_id, ctx, db)


def _set_status(agent_id: uuid.UUID, new_status: str, ctx: CompanyDep, db: DbDep, minimum: str) -> dict[str, Any]:
    ctx.require(minimum)
    agent = _agent(db, ctx.company.id, agent_id)
    old = agent.status
    agent.status = new_status
    agent.version += 1
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        f"agent.{new_status}",
        "agent",
        agent.id,
        f"Agent {agent.name}: {old} → {new_status}",
    )
    db.commit()
    return get_agent(agent_id, ctx, db)


@router.post("/companies/{company_id}/agents/{agent_id}/pause")
def pause_agent(agent_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    return _set_status(agent_id, "paused", ctx, db, "member")


@router.post("/companies/{company_id}/agents/{agent_id}/resume")
def resume_agent(agent_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    return _set_status(agent_id, "active", ctx, db, "admin")


@router.post("/companies/{company_id}/agents/{agent_id}/archive")
def archive_agent(agent_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    reports = db.scalar(select(func.count()).where(Agent.manager_id == agent_id, Agent.status != "archived"))
    if reports:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reassign this agent's reports before archiving it.")
    return _set_status(agent_id, "archived", ctx, db, "admin")


@router.post("/companies/{company_id}/org/reorder")
def reorder(body: list[dict[str, Any]], ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    """Body: [{"id", "manager_id" | null, "position"}]. Validated as a whole: no loops."""
    ctx.require("admin")
    agents = {a.id: a for a in db.scalars(select(Agent).where(Agent.company_id == ctx.company.id))}
    plan: dict[uuid.UUID, uuid.UUID | None] = {a.id: a.manager_id for a in agents.values()}
    positions: dict[uuid.UUID, int] = {}
    try:
        for item in body:
            aid = uuid.UUID(str(item["id"]))
            mid = uuid.UUID(str(item["manager_id"])) if item.get("manager_id") else None
            if aid not in agents or (mid is not None and mid not in agents):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown agent in the new organization.")
            plan[aid] = mid
            positions[aid] = int(item.get("position", agents[aid].position))
    except (KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Invalid organization payload: {exc}") from exc
    for start in plan:
        seen: set[uuid.UUID] = set()
        current: uuid.UUID | None = start
        while current is not None:
            if current in seen:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The new organization contains a loop.")
            seen.add(current)
            current = plan[current]
    for aid, agent in agents.items():
        if agent.manager_id != plan[aid] or (aid in positions and agent.position != positions[aid]):
            agent.manager_id = plan[aid]
            agent.position = positions.get(aid, agent.position)
            agent.version += 1
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "org.reorganized",
        "company",
        ctx.company.id,
        f"Organization updated ({len(body)} position(s))",
    )
    db.commit()
    return list_agents(ctx, db)


# ---------------------------------------------------------------- goals & projects


@router.get("/companies/{company_id}/goals")
def list_goals(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    goals = db.scalars(select(Goal).where(Goal.company_id == ctx.company.id).order_by(Goal.created_at)).all()
    counts = dict(
        db.execute(
            select(Task.goal_id, func.count()).where(Task.company_id == ctx.company.id).group_by(Task.goal_id)
        ).all()
    )
    return [{**goal_out(g), "task_count": counts.get(g.id, 0)} for g in goals]


@router.post("/companies/{company_id}/goals", status_code=201)
def create_goal(body: GoalIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    goal = Goal(company_id=ctx.company.id, **body.model_dump())
    db.add(goal)
    db.flush()
    record(db, ctx.company.id, ctx.principal.actor, "goal.created", "goal", goal.id, f"Goal: {goal.title}")
    db.commit()
    return {**goal_out(goal), "task_count": 0}


@router.patch("/companies/{company_id}/goals/{goal_id}")
def patch_goal(goal_id: uuid.UUID, body: GoalIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    goal = db.get(Goal, goal_id)
    if goal is None or goal.company_id != ctx.company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found.")
    for key, value in body.model_dump().items():
        setattr(goal, key, value)
    record(db, ctx.company.id, ctx.principal.actor, "goal.updated", "goal", goal.id, f"Goal updated: {goal.title}")
    db.commit()
    return goal_out(goal)


@router.get("/companies/{company_id}/projects")
def list_projects(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    projects = db.scalars(
        select(Project).where(Project.company_id == ctx.company.id).order_by(Project.created_at)
    ).all()
    counts = dict(
        db.execute(
            select(Task.project_id, func.count()).where(Task.company_id == ctx.company.id).group_by(Task.project_id)
        ).all()
    )
    return [{**project_out(p), "task_count": counts.get(p.id, 0)} for p in projects]


@router.post("/companies/{company_id}/projects", status_code=201)
def create_project(body: ProjectIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    if body.goal_id:
        goal = db.get(Goal, body.goal_id)
        if goal is None or goal.company_id != ctx.company.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown goal.")
    project = Project(company_id=ctx.company.id, **body.model_dump())
    db.add(project)
    db.flush()
    record(
        db, ctx.company.id, ctx.principal.actor, "project.created", "project", project.id, f"Project: {project.name}"
    )
    db.commit()
    return {**project_out(project), "task_count": 0}


@router.patch("/companies/{company_id}/projects/{project_id}")
def patch_project(project_id: uuid.UUID, body: ProjectIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("member")
    project = db.get(Project, project_id)
    if project is None or project.company_id != ctx.company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    for key, value in body.model_dump().items():
        setattr(project, key, value)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "project.updated",
        "project",
        project.id,
        f"Project updated: {project.name}",
    )
    db.commit()
    return project_out(project)
