"""From an agent's output to a finished, verified, accountable task.

output -> select-verify receipt -> (blocked | failed -> correction | verified)
verified -> approval needed?  yes -> approval queue  /  no -> done, autonomy credited
done -> follow-ups by code (automation.on_done): route a triaged message, queue an e-mail.
Every step writes an audit event. Nothing is sent from here: an e-mail becomes a Delivery
that the worker sends once, after the approval rules.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from select_verify import Contract, Receipt, verify
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import automation, autonomy
from .audit import record
from .auth import SYSTEM, Actor
from .contracts import build_context, get_contract
from .models import Agent, Approval, Company, Outcome, ReceiptRow, Run, Task, TaskComment
from .outbound import OutgoingEmail, known_senders, render_email


class PipelineError(RuntimeError):
    pass


@dataclass
class Result:
    status: str  # done | awaiting_approval | needs_correction | blocked
    receipt: ReceiptRow
    approval: Approval | None = None
    message: str = ""


def _now() -> datetime:
    return datetime.now(UTC)


def render_preview(contract: Contract, deliverable: dict[str, Any], currency: str = "EUR") -> list[str]:
    """Plain lines describing a result that is not sent as an e-mail (or a demo result)."""

    def v(x: Any) -> str:
        return str(x.get("value")) if isinstance(x, dict) and "value" in x else str(x)

    if contract.id in ("quote", "invoice_draft"):
        customer = deliverable.get("customer", {})
        lines = [f"To: {v(customer.get('name', ''))} <{v(customer.get('email', ''))}>"]
        if contract.id == "invoice_draft":
            lines.append(f"Invoice {deliverable.get('invoice_number', '')} (draft, not an e-invoice)")
        for line in deliverable.get("lines", []):
            lines.append(
                f"{v(line.get('quantity'))} x {line.get('label', line.get('catalog_ref', ''))} "
                f"@ {v(line.get('unit_price'))} = {v(line.get('line_total'))}"
            )
        totals = deliverable.get("totals", {})
        lines.append(
            f"Net {v(totals.get('net'))} · VAT {v(totals.get('vat'))} · Total {v(totals.get('gross'))} {currency}"
        )
        return lines
    if contract.id == "support_reply":
        return [
            f"To: {v(deliverable.get('to', ''))}",
            f"Subject: {deliverable.get('subject', '')}",
            "",
            str(deliverable.get("body", "")),
        ]
    if contract.id == "social_post":
        return [f"Channel: {deliverable.get('channel', '')}", "", str(deliverable.get("text", ""))]
    return [f"{k}: {v(val)}" for k, val in deliverable.items()]


def _comment(db: Session, task: Task, actor: Actor, body: str) -> None:
    db.add(TaskComment(task_id=task.id, author_type=actor.type, author_id=actor.id, author_name=actor.name, body=body))


def _outcome(
    db: Session, task: Task, level: str, *, autonomous: bool, verified: bool, reviewed: bool, undetected: bool = False
) -> Outcome:
    outcome = Outcome(
        company_id=task.company_id,
        task_id=task.id,
        agent_id=task.assignee_id,
        task_type=task.task_type,
        level_at_run=level,
        autonomous=autonomous,
        verified=verified,
        reviewed=reviewed,
        undetected_error=undetected,
        is_demo=task.is_demo,
    )
    db.add(outcome)
    return outcome


def process_output(db: Session, task: Task, run: Run, output: dict[str, Any], actor: Actor) -> Result:
    company = db.get(Company, task.company_id)
    contract = get_contract(task.task_type)
    if company is None or contract is None:
        raise PipelineError(f"no contract for task type '{task.task_type}'")
    agent = db.get(Agent, task.assignee_id) if task.assignee_id else None
    policy = autonomy.policy_for(company)

    run.output = output
    run.status = "succeeded"
    run.finished_at = _now()
    task.result = output

    receipt: Receipt = verify(contract, output, build_context(company, task), run_id=str(run.id))
    row = ReceiptRow(
        company_id=task.company_id,
        run_id=run.id,
        task_id=task.id,
        agent_id=task.assignee_id,
        contract_id=contract.id,
        contract_version=contract.version,
        contract_sha256=contract.sha256,
        status=receipt.status,
        body=receipt.model_dump(mode="json"),
        is_demo=task.is_demo,
    )
    db.add(row)
    db.flush()
    failed_ids = [c.id for c in receipt.blocking_failures]
    record(
        db,
        task.company_id,
        SYSTEM,
        f"verification.{receipt.status}",
        "task",
        task.id,
        f"T-{task.number} {contract.id} v{contract.version}: {receipt.status}"
        + (f" ({', '.join(failed_ids)})" if failed_ids else ""),
        {"receipt_id": str(row.id), "run_id": str(run.id), "failed": failed_ids, "missing": receipt.missing},
        is_demo=task.is_demo,
    )

    if receipt.status == "blocked":
        task.status = "blocked"
        _comment(db, task, SYSTEM, "Missing information, nothing was guessed: " + ", ".join(receipt.missing))
        return Result("blocked", row, message="missing information")

    trust = autonomy.get_trust(db, task.company_id, agent.id, task.task_type) if agent else None

    if receipt.status == "failed":
        if trust is not None:
            event = autonomy.record_failure(
                db,
                trust,
                f"blocking check(s) failed on T-{task.number}: {', '.join(failed_ids)}",
                SYSTEM,
                receipt_id=row.id,
                is_demo=task.is_demo,
            )
            if event:
                record(
                    db,
                    task.company_id,
                    SYSTEM,
                    "autonomy.demoted",
                    "agent",
                    trust.agent_id,
                    event.reason,
                    {"task_type": trust.task_type, "receipt_id": str(row.id)},
                    is_demo=task.is_demo,
                )
        if task.attempts <= contract.correction.max_attempts:
            task.status = "in_progress"
            _comment(db, task, SYSTEM, "Verification failed; a correction is needed: " + ", ".join(failed_ids))
            return Result("needs_correction", row, message="correction needed")
        task.status = "blocked"
        _comment(
            db, task, SYSTEM, f"Verification still failing after {task.attempts} attempt(s). A human must take over."
        )
        return Result("blocked", row, message="correction limit reached")

    # verified
    if trust is None:
        decision = autonomy.ApprovalDecision(True, "supervised", "supervised")
    else:
        decision = autonomy.approval_needed(trust, contract, task.id, policy)
    email = (
        None if task.is_demo else render_email(db, company, task, contract, output, autonomous=not decision.required)
    )
    if not decision.required and email is not None and email.to.lower() not in known_senders(db, task):
        # Writing to an address that never wrote to us is a human decision, whatever the licence.
        decision = autonomy.ApprovalDecision(True, "new_recipient", decision.effective_level)
        email = render_email(db, company, task, contract, output, autonomous=False)
    if decision.required:
        approval = Approval(
            company_id=task.company_id,
            task_id=task.id,
            run_id=run.id,
            receipt_id=row.id,
            agent_id=task.assignee_id,
            reason=decision.reason,
            action=contract.approval.external_action,
            payload={
                "action": contract.approval.external_action,
                "preview": email.preview() if email else render_preview(contract, output, company.currency),
                "content": output,
                "level": decision.effective_level,
                **({"email": email.as_dict()} if email else {}),
            },
            is_demo=task.is_demo,
        )
        db.add(approval)
        task.status = "awaiting_approval"
        db.flush()
        record(
            db,
            task.company_id,
            SYSTEM,
            "approval.requested",
            "approval",
            approval.id,
            f"T-{task.number} waits for a human ({decision.reason})",
            {"task_id": str(task.id), "reason": decision.reason},
            is_demo=task.is_demo,
        )
        return Result("awaiting_approval", row, approval)

    task.status = "done"
    _outcome(db, task, decision.effective_level, autonomous=True, verified=True, reviewed=False)
    if trust is not None:
        event = autonomy.credit_success(db, trust, contract, policy, SYSTEM, receipt_id=row.id, is_demo=task.is_demo)
        if event:
            record(
                db,
                task.company_id,
                SYSTEM,
                "autonomy.promoted",
                "agent",
                trust.agent_id,
                event.reason,
                {"task_type": trust.task_type},
                is_demo=task.is_demo,
            )
    record(
        db,
        task.company_id,
        SYSTEM,
        "task.completed_autonomously",
        "task",
        task.id,
        f"T-{task.number} finished without human review ({decision.reason})",
        {"action": contract.approval.external_action},
        is_demo=task.is_demo,
    )
    automation.on_done(
        db, task, run_id=run.id, approval=None, email=email, approved_by=f"autonomous ({decision.effective_level})"
    )
    return Result("done", row)


def decide(db: Session, approval: Approval, decision: str, note: str, actor: Actor) -> Approval:
    if approval.status != "pending":
        raise PipelineError(f"approval already {approval.status}")
    if decision not in ("approved", "rejected", "changes_requested"):
        raise PipelineError("decision must be approved, rejected or changes_requested")
    if decision != "approved" and not note.strip():
        raise PipelineError("explain what is wrong so the agent (and the audit log) can learn from it")
    task = db.get(Task, approval.task_id)
    company = db.get(Company, approval.company_id)
    if task is None or company is None:
        raise PipelineError("task no longer exists")
    contract = get_contract(task.task_type)
    if contract is None:
        raise PipelineError(f"no contract for task type '{task.task_type}'")
    policy = autonomy.policy_for(company)
    trust = autonomy.get_trust(db, task.company_id, task.assignee_id, task.task_type) if task.assignee_id else None
    level = str(approval.payload.get("level", "supervised"))

    approval.status = decision
    approval.decided_by = actor.name
    approval.decided_at = _now()
    approval.note = note or None

    if decision == "approved":
        task.status = "done"
        _outcome(db, task, level, autonomous=False, verified=True, reviewed=True)
        if trust is not None:
            event = autonomy.credit_success(
                db, trust, contract, policy, actor, receipt_id=approval.receipt_id, is_demo=task.is_demo
            )
            if event:
                record(
                    db,
                    task.company_id,
                    SYSTEM,
                    "autonomy.promoted",
                    "agent",
                    trust.agent_id,
                    event.reason,
                    {"task_type": trust.task_type},
                    is_demo=task.is_demo,
                )
        summary = f"{actor.name} approved T-{task.number}"
    else:
        # The checks passed but a human found a problem: that is an undetected error.
        _outcome(db, task, level, autonomous=False, verified=True, reviewed=True, undetected=True)
        if trust is not None:
            event = autonomy.record_failure(
                db,
                trust,
                f"human {decision.replace('_', ' ')} on T-{task.number}: {note}",
                actor,
                receipt_id=approval.receipt_id,
                is_demo=task.is_demo,
            )
            if event:
                record(
                    db,
                    task.company_id,
                    actor,
                    "autonomy.demoted",
                    "agent",
                    trust.agent_id,
                    event.reason,
                    {"task_type": trust.task_type},
                    is_demo=task.is_demo,
                )
        task.status = "cancelled" if decision == "rejected" else "in_progress"
        _comment(db, task, actor, note)
        summary = f"{actor.name} {decision.replace('_', ' ')} T-{task.number}: {note}"
    record(
        db,
        task.company_id,
        actor,
        f"approval.{decision}",
        "approval",
        approval.id,
        summary,
        {"task_id": str(task.id), "note": note},
        is_demo=task.is_demo,
    )
    if decision == "approved":
        stored = approval.payload.get("email")
        automation.on_done(
            db,
            task,
            run_id=approval.run_id,
            approval=approval,
            email=OutgoingEmail.from_dict(stored) if isinstance(stored, dict) else None,
            approved_by=actor.name,
        )
    return approval


def report_problem(db: Session, task: Task, note: str, actor: Actor) -> Outcome:
    """A human found an error in work that already finished (complaint, spot check).

    The outcome is marked as an undetected error, which feeds the error rate shown next to the
    autonomy rate, and the agent loses its licence for this task type.
    """
    if task.status != "done":
        raise PipelineError("only finished tasks can be reported")
    if not note.strip():
        raise PipelineError("describe the problem")
    outcome = db.scalars(select(Outcome).where(Outcome.task_id == task.id).order_by(Outcome.created_at.desc())).first()
    if outcome is None:
        raise PipelineError("this task has no recorded outcome")
    if outcome.undetected_error:
        raise PipelineError("a problem was already reported on this task")
    outcome.undetected_error = True
    outcome.reviewed = True
    if task.assignee_id:
        trust = autonomy.get_trust(db, task.company_id, task.assignee_id, task.task_type)
        event = autonomy.record_failure(
            db,
            trust,
            f"problem reported on T-{task.number} after completion: {note}",
            actor,
            receipt_id=None,
            is_demo=task.is_demo,
        )
        if event:
            record(
                db,
                task.company_id,
                actor,
                "autonomy.demoted",
                "agent",
                trust.agent_id,
                event.reason,
                {"task_type": trust.task_type},
                is_demo=task.is_demo,
            )
    _comment(db, task, actor, f"Problem reported: {note}")
    record(
        db,
        task.company_id,
        actor,
        "task.problem_reported",
        "task",
        task.id,
        f"{actor.name} reported a problem on T-{task.number}: {note}",
        {"note": note},
        is_demo=task.is_demo,
    )
    return outcome


def new_run(db: Session, task: Task, mode: str, *, idempotency_key: str | None = None) -> Run:
    task.attempts += 1
    run = Run(
        company_id=task.company_id,
        task_id=task.id,
        agent_id=task.assignee_id,
        attempt=task.attempts,
        mode=mode,
        status="running",
        started_at=_now(),
        idempotency_key=idempotency_key,
    )
    db.add(run)
    db.flush()
    return run


def ensure_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise PipelineError("invalid id") from exc
