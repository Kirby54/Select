"""Business templates: a starting team (agents, reporting lines, routing, routines) for a new company.

Templates are plain JSON files in packs/templates/, written in French, German and English.
Applying one creates ordinary agents and routines that the owner can change afterwards.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .audit import record
from .auth import Actor
from .company_profile import DEFAULT_ROUTING
from .config import get_settings
from .contracts import registry
from .models import Agent, Company, Routine
from .routines import upcoming


class TemplateError(ValueError):
    pass


@lru_cache
def load_all() -> dict[str, dict[str, Any]]:
    folder = get_settings().packs_dir / "templates"
    templates: dict[str, dict[str, Any]] = {}
    known = set(registry())
    for path in sorted(folder.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for agent in data["agents"]:
            unknown = set(agent["task_types"]) - known
            if unknown:
                raise TemplateError(f"{path.name}: unknown task type(s) {sorted(unknown)}")
        templates[data["id"]] = data
    return dict(sorted(templates.items(), key=lambda kv: kv[1].get("order", 99)))


def _text(value: dict[str, str] | str, language: str) -> str:
    if isinstance(value, str):
        return value
    return value.get(language) or value.get("en") or next(iter(value.values()))


def summary(language: str) -> list[dict[str, Any]]:
    return [
        {
            "id": t["id"],
            "name": _text(t["name"], language),
            "description": _text(t["description"], language),
            "agents": [
                {"name": _text(a["name"], language), "role": _text(a["role"], language), "task_types": a["task_types"]}
                for a in t["agents"]
            ],
            "routines": [_text(r["name"], language) for r in t["routines"]],
        }
        for t in load_all().values()
    ]


def apply(
    db: Session,
    company: Company,
    template_id: str,
    actor: Actor,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    template = load_all().get(template_id)
    if template is None:
        raise TemplateError(f"unknown template '{template_id}'")
    if db.scalar(select(func.count()).where(Agent.company_id == company.id, Agent.status != "archived")):
        raise TemplateError("this company already has agents; templates only start an empty team")
    language = company.language
    agents: dict[str, Agent] = {}
    for position, spec in enumerate(template["agents"]):
        agent = Agent(
            company_id=company.id,
            name=_text(spec["name"], language),
            role=_text(spec["role"], language),
            instructions=_text(spec["instructions"], language),
            task_types=list(spec["task_types"]),
            permissions=list(spec.get("permissions", [])),
            manager_id=agents[spec["manager"]].id if spec.get("manager") else None,
            position=position,
            provider=provider if provider and model else None,
            model=model if provider and model else None,
            config={"template": template_id, "template_key": spec["key"]},
        )
        db.add(agent)
        db.flush()
        agents[spec["key"]] = agent
    company.settings = {**(company.settings or {}), "routing": {**DEFAULT_ROUTING, **template.get("routing", {})}}
    routines = []
    for spec in template["routines"]:
        routine = Routine(
            company_id=company.id,
            name=_text(spec["name"], language),
            cron=spec["cron"],
            timezone=company.timezone,
            enabled=bool(spec.get("enabled", False)),
            title=_text(spec["title"], language),
            description=_text(spec.get("description", ""), language),
            task_type=spec["task_type"],
            assignee_id=agents[spec["agent"]].id if spec.get("agent") else None,
            priority="medium",
            created_by=actor.name,
        )
        routine.next_run_at = upcoming(routine.cron, routine.timezone, 1)[0]
        db.add(routine)
        routines.append(routine)
    record(
        db,
        company.id,
        actor,
        "company.template_applied",
        "company",
        company.id,
        f"Template '{_text(template['name'], language)}': {len(agents)} agent(s), {len(routines)} routine(s)",
        {"template": template_id},
    )
    return {"agents": len(agents), "routines": len(routines)}
