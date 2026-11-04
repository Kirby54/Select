"""Whether a live run may start: emergency stop, agent state, provider connection and budgets."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Agent, Company, CostEvent, ProviderConnection


class RunRefused(RuntimeError):
    """The run was not attempted (budget, stop, missing connection). Nothing was spent."""


def month_spend(db: Session, company_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> Decimal:
    start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    query = select(func.coalesce(func.sum(CostEvent.amount), 0)).where(
        CostEvent.company_id == company_id, CostEvent.created_at >= start, CostEvent.is_demo.is_(False)
    )
    if agent_id is not None:
        query = query.where(CostEvent.agent_id == agent_id)
    return Decimal(str(db.scalar(query) or 0))


def check_can_run(db: Session, company: Company, agent: Agent | None) -> ProviderConnection:
    if company.emergency_stop:
        raise RunRefused("Emergency stop is on for this company.")
    if agent is None:
        raise RunRefused("The task has no assignee.")
    if agent.status != "active":
        raise RunRefused(f"Agent {agent.name} is {agent.status}.")
    if not agent.provider or not agent.model:
        raise RunRefused(f"Agent {agent.name} has no provider and model; set them on the agent page.")
    connection = db.scalar(
        select(ProviderConnection).where(
            ProviderConnection.company_id == company.id, ProviderConnection.provider == agent.provider
        )
    )
    if connection is None or not connection.enabled:
        raise RunRefused(f"No enabled {agent.provider} connection. Add one in Connections.")
    if company.monthly_budget > 0 and month_spend(db, company.id) >= company.monthly_budget:
        raise RunRefused("Company monthly budget reached: runs are stopped until the budget is raised.")
    if agent.monthly_budget > 0 and month_spend(db, company.id, agent.id) >= agent.monthly_budget:
        raise RunRefused(f"Monthly budget of {agent.name} reached.")
    return connection
