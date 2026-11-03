"""Autonomy licence: per agent and per task type, earned from verified outcomes.

Rules (see docs/autonomy.md):
- A level never exceeds the cap of the contract's risk class. Legal-risk work is capped at
  "supervised" in code; no policy, score or agent can change that.
- Promotion needs a streak of successes that a human accepted or that finished without objection.
- A blocking verification failure or a human correction demotes straight to "supervised".
- A human revocation freezes the licence until a human clears it.
The default thresholds are starting hypotheses to calibrate, not proven values.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from select_verify import Contract
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import Actor
from .models import LEVELS, Agent, Company, Outcome, Trust, TrustEvent

LEGAL_RISK = "legal"
DEFAULT_POLICY: dict[str, Any] = {
    "promote_after": {"supervised": 20, "sampled": 50},
    "sample_rate": 0.2,
    "max_level_by_risk": {"low": "autonomous", "medium": "autonomous", "high": "supervised"},
}


def rank(level: str) -> int:
    return LEVELS.index(level)


def policy_for(company: Company) -> dict[str, Any]:
    merged = {**DEFAULT_POLICY, **(company.policy or {})}
    merged["promote_after"] = {**DEFAULT_POLICY["promote_after"], **merged.get("promote_after", {})}
    merged["max_level_by_risk"] = {**DEFAULT_POLICY["max_level_by_risk"], **merged.get("max_level_by_risk", {})}
    return merged


def validate_policy(policy: dict[str, Any]) -> list[str]:
    errors = []
    for level, value in policy.get("promote_after", {}).items():
        if level not in ("supervised", "sampled"):
            errors.append(f"promote_after.{level}: only 'supervised' and 'sampled' can be promoted")
        elif not isinstance(value, int) or not 1 <= value <= 10_000:
            errors.append(f"promote_after.{level}: must be an integer between 1 and 10000")
    rate = policy.get("sample_rate", DEFAULT_POLICY["sample_rate"])
    if not isinstance(rate, (int, float)) or not 0 <= rate <= 1:
        errors.append("sample_rate: must be between 0 and 1")
    for risk, level in policy.get("max_level_by_risk", {}).items():
        if risk == LEGAL_RISK:
            errors.append("max_level_by_risk.legal: legal-risk work is always supervised and cannot be configured")
        elif risk not in ("low", "medium", "high"):
            errors.append(f"max_level_by_risk.{risk}: unknown risk class")
        elif level not in LEVELS:
            errors.append(f"max_level_by_risk.{risk}: unknown level '{level}'")
    return errors


def risk_cap(contract: Contract, policy: dict[str, Any]) -> str:
    if contract.risk == LEGAL_RISK:
        return "supervised"
    return str(policy["max_level_by_risk"].get(contract.risk, "supervised"))


def get_trust(db: Session, company_id: uuid.UUID, agent_id: uuid.UUID, task_type: str) -> Trust:
    trust = db.scalar(select(Trust).where(Trust.agent_id == agent_id, Trust.task_type == task_type))
    if trust is None:
        trust = Trust(company_id=company_id, agent_id=agent_id, task_type=task_type, level="supervised")
        db.add(trust)
        db.flush()
    return trust


def in_sample(task_id: uuid.UUID, rate: float) -> bool:
    """Deterministic sampling so a run can be reproduced and audited."""
    digest = int(hashlib.sha256(str(task_id).encode()).hexdigest()[:8], 16)
    return digest / 0xFFFFFFFF < rate


@dataclass
class ApprovalDecision:
    required: bool
    reason: str  # supervised | sampled | contract_always | risk_cap | autonomous
    effective_level: str


def approval_needed(trust: Trust, contract: Contract, task_id: uuid.UUID, policy: dict[str, Any]) -> ApprovalDecision:
    cap = risk_cap(contract, policy)
    effective = trust.level if rank(trust.level) <= rank(cap) else cap
    if contract.approval.mode == "always":
        return ApprovalDecision(True, "contract_always", effective)
    if effective == "supervised":
        reason = "risk_cap" if rank(trust.level) > rank(cap) else "supervised"
        return ApprovalDecision(True, reason, effective)
    if effective == "sampled":
        if in_sample(task_id, float(policy["sample_rate"])):
            return ApprovalDecision(True, "sampled", effective)
        return ApprovalDecision(False, "sampled_skip", effective)
    return ApprovalDecision(False, "autonomous", effective)


def _event(
    db: Session,
    trust: Trust,
    kind: str,
    to_level: str,
    reason: str,
    actor: Actor,
    receipt_id: uuid.UUID | None,
    is_demo: bool,
) -> TrustEvent:
    event = TrustEvent(
        company_id=trust.company_id,
        trust_id=trust.id,
        agent_id=trust.agent_id,
        task_type=trust.task_type,
        kind=kind,
        from_level=trust.level,
        to_level=to_level,
        reason=reason,
        receipt_id=receipt_id,
        actor=actor.name,
        is_demo=is_demo,
    )
    trust.level = to_level
    db.add(event)
    return event


def credit_success(
    db: Session,
    trust: Trust,
    contract: Contract,
    policy: dict[str, Any],
    actor: Actor,
    *,
    receipt_id: uuid.UUID | None,
    is_demo: bool = False,
) -> TrustEvent | None:
    trust.successes += 1
    trust.streak += 1
    if trust.frozen or trust.level == "autonomous":
        return None
    threshold = int(policy["promote_after"].get(trust.level, 10_000))
    if trust.streak < threshold:
        return None
    target = LEVELS[rank(trust.level) + 1]
    cap = risk_cap(contract, policy)
    if rank(target) > rank(cap):
        return None
    streak = trust.streak
    trust.streak = 0
    explanation = (
        f"Promoted to {target}: {streak} verified successes in a row on '{contract.id}' "
        f"(threshold {threshold}). Risk class '{contract.risk}' allows up to {cap}."
    )
    return _event(db, trust, "promote", target, explanation, actor, receipt_id, is_demo)


def record_failure(
    db: Session,
    trust: Trust,
    reason: str,
    actor: Actor,
    *,
    receipt_id: uuid.UUID | None,
    is_demo: bool = False,
) -> TrustEvent | None:
    trust.failures += 1
    trust.streak = 0
    if trust.level == "supervised":
        return None
    return _event(db, trust, "demote", "supervised", f"Demoted to supervised: {reason}", actor, receipt_id, is_demo)


def revoke(db: Session, trust: Trust, actor: Actor, note: str) -> TrustEvent:
    trust.frozen = True
    trust.streak = 0
    reason = f"Revoked by {actor.name}: {note}" if note else f"Revoked by {actor.name}"
    return _event(db, trust, "revoke", "supervised", reason + ". Frozen until a human clears it.", actor, None, False)


def unfreeze(db: Session, trust: Trust, actor: Actor) -> TrustEvent:
    trust.frozen = False
    return _event(
        db, trust, "unfreeze", trust.level, f"Unfrozen by {actor.name}; promotions can resume.", actor, None, False
    )


def counter(db: Session, company_id: uuid.UUID, days: int = 7, *, include_demo: bool = True) -> dict[str, Any]:
    """Autonomy rate and undetected-error rate, always reported together."""
    since = datetime.now(UTC) - timedelta(days=days)
    base = select(Outcome).where(Outcome.company_id == company_id, Outcome.created_at >= since)
    if not include_demo:
        base = base.where(Outcome.is_demo.is_(False))
    rows = db.scalars(base).all()
    finished = len(rows)
    autonomous = sum(1 for r in rows if r.autonomous)
    reviewed = [r for r in rows if r.reviewed and r.verified]
    undetected = sum(1 for r in reviewed if r.undetected_error)
    measurable = len(reviewed) >= 5
    by_agent: dict[str, dict[str, int]] = {}
    for r in rows:
        key = str(r.agent_id)
        slot = by_agent.setdefault(key, {"finished": 0, "autonomous": 0})
        slot["finished"] += 1
        slot["autonomous"] += int(r.autonomous)
    return {
        "period_days": days,
        "finished": finished,
        "autonomous": autonomous,
        "autonomy_rate": round(autonomous / finished, 4) if finished else None,
        "reviewed": len(reviewed),
        "undetected_errors": undetected,
        "undetected_error_rate": round(undetected / len(reviewed), 4) if measurable else None,
        "undetected_error_measurable": measurable,
        "by_agent": by_agent,
        "includes_demo": include_demo and any(r.is_demo for r in rows),
    }


def level_counts(db: Session, company_id: uuid.UUID) -> dict[str, int]:
    rows = db.execute(
        select(Trust.level, func.count()).where(Trust.company_id == company_id).group_by(Trust.level)
    ).all()
    counts = {level: 0 for level in LEVELS}
    counts.update({level: n for level, n in rows})
    return counts


def agent_is_runnable(agent: Agent | None) -> bool:
    return agent is not None and agent.status == "active"
