"""Fail-closed resource-bound review permissions for code proposals.

A grant permits submitting a review-only code proposal for exactly one repository.
It NEVER permits applying code, running commands, emailing or acquiring autonomous trust.
Grants live in the agent's server-managed JSON config (no schema migration).
"""
from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from .contracts import get_contract
from .models import Agent, Task

REPO_SCOPE = re.compile(r"^repo:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
KEY = "capability_grants"
MAX_GRANTS = 100
MAX_TTL_DAYS = 90


class CapabilityDenied(ValueError):
    """An agent has no current permission for the requested exact task scope."""


def valid_scope(scope: str) -> bool:
    if not REPO_SCOPE.fullmatch(scope):
        return False
    owner, name = scope[5:].split("/")
    return owner not in {".", ".."} and name not in {".", ".."}


def grants(agent: Agent, now: datetime | None = None) -> list[dict[str, Any]]:
    current = now or datetime.now(UTC)
    rows = (agent.config or {}).get(KEY, [])
    result = []
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        expiry = item.get("expires_at")
        try:
            expired = not expiry or datetime.fromisoformat(str(expiry)) <= current
        except (TypeError, ValueError):
            expired = True
        contract = get_contract(str(item.get("task_type", "")))
        version_ok = bool(contract and contract.sha256 == item.get("contract_sha256"))
        revoked = bool(item.get("revoked_at"))
        result.append({
            **item,
            "status": "revoked" if revoked else "expired" if expired else
            "contract_changed" if not version_ok else "active",
            "current_contract_sha256": contract.sha256 if contract else None,
        })
    return result


def issue(agent: Agent, scope: str, actor: str, days: int) -> dict[str, Any]:
    if not valid_scope(scope):
        raise CapabilityDenied("Resource must be an exact repository scope like repo:owner/name.")
    if "code_change" not in (agent.task_types or []):
        raise CapabilityDenied("Enable the code_change task type on the agent first.")
    if days < 1 or days > MAX_TTL_DAYS:
        raise CapabilityDenied(f"Expiration must be between 1 and {MAX_TTL_DAYS} days.")
    existing = list((agent.config or {}).get(KEY, []))
    if len(existing) >= MAX_GRANTS:
        raise CapabilityDenied("Too many grants on this agent; create a new agent or revoke old ones.")
    if any(g["scope"] == scope and g["status"] == "active" for g in grants(agent)):
        raise CapabilityDenied("An active grant for this repository already exists.")
    contract = get_contract("code_change")
    if contract is None:
        raise CapabilityDenied("The code_change verification contract is unavailable.")
    created = datetime.now(UTC)
    grant = {
        "id": str(uuid.uuid4()), "task_type": "code_change", "scope": scope,
        "risk": contract.risk, "contract_version": contract.version,
        "contract_sha256": contract.sha256,
        "created_at": created.isoformat(), "expires_at": (created + timedelta(days=days)).isoformat(),
        "created_by": actor, "revoked_at": None, "revoked_by": None,
    }
    agent.config = {**(agent.config or {}), KEY: [*existing, grant]}
    return grant


def revoke(agent: Agent, grant_id: uuid.UUID, actor: str) -> dict[str, Any]:
    entries = list((agent.config or {}).get(KEY, []))
    for entry in entries:
        if entry.get("id") == str(grant_id):
            if entry.get("revoked_at"):
                raise CapabilityDenied("This grant is already revoked.")
            changed = {**entry, "revoked_at": datetime.now(UTC).isoformat(), "revoked_by": actor}
            agent.config = {
                **(agent.config or {}),
                KEY: [changed if item.get("id") == str(grant_id) else item for item in entries],
            }
            return changed
    raise CapabilityDenied("Grant not found.")


def require(agent: Agent | None, task_type: str, scope: str | None) -> dict[str, Any] | None:
    """No grant from another agent, company, task type, repo or contract can match."""
    if task_type != "code_change":
        if scope:
            raise CapabilityDenied("Resource-scoped tasks currently support code_change only.")
        return None
    if not scope or not valid_scope(scope):
        raise CapabilityDenied("A code_change task requires an explicit repo:owner/name resource scope.")
    if agent is None or agent.status != "active" or "code_change" not in (agent.task_types or []):
        raise CapabilityDenied("The assigned agent cannot propose code changes.")
    for grant in grants(agent):
        if grant.get("scope") == scope and grant.get("task_type") == task_type and grant["status"] == "active":
            return grant
    raise CapabilityDenied(
        f"Permission denied for {scope}: no active, unexpired code_change grant with the current contract."
    )


def task_scope(task: Task) -> str | None:
    value = (task.inputs or {}).get("resource_scope")
    return value if isinstance(value, str) else None


def require_task(agent: Agent | None, task: Task) -> dict[str, Any] | None:
    return require(agent, task.task_type, task_scope(task))
