"""Input schemas (validated) and output serializers."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import (
    Agent,
    ApiToken,
    Approval,
    AuditEvent,
    Company,
    Delivery,
    Goal,
    Invitation,
    MailAccount,
    MailMessage,
    Project,
    ProviderConnection,
    ReceiptRow,
    Routine,
    Run,
    Task,
    TaskComment,
    Trust,
    TrustEvent,
    User,
)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Language = Literal["fr", "de", "en"]
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$"


class CompanyIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    # A preset country fills currency, VAT rates, time zone and language unless they are given.
    country: str = Field(default="DE", pattern=r"^[A-Z]{2}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    vat_rates: list[str] | None = Field(default=None, max_length=12)
    timezone: str | None = Field(default=None, max_length=64)
    language: Language | None = None
    monthly_budget: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)


class CompanyPatch(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    monthly_budget: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    policy: dict[str, Any] | None = None
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    vat_rates: list[str] | None = Field(default=None, max_length=12)
    timezone: str | None = Field(default=None, max_length=64)
    language: Language | None = None
    settings: dict[str, Any] | None = None


class CatalogItemIn(Strict):
    ref: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_.\-]+$")
    label: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=16)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    # Checked against the company's VAT rates when the catalog is saved.
    vat_rate: str = Field(default="0.19", pattern=r"^(0|0?\.\d{1,4})$")


class AgentIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    objectives: str = Field(default="", max_length=2000)
    instructions: str = Field(default="", max_length=8000)
    manager_id: uuid.UUID | None = None
    provider: Literal["anthropic", "openai", "gemini", "ollama"] | None = None
    model: str | None = Field(default=None, max_length=120)
    task_types: list[str] = Field(default_factory=list)
    permissions: list[Literal["read_messages", "draft_external", "read_catalog"]] = Field(default_factory=list)
    monthly_budget: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)


class AgentPatch(Strict):
    version: int
    name: str | None = Field(default=None, min_length=1, max_length=80)
    role: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    objectives: str | None = Field(default=None, max_length=2000)
    instructions: str | None = Field(default=None, max_length=8000)
    manager_id: uuid.UUID | None = None
    clear_manager: bool = False
    provider: Literal["anthropic", "openai", "gemini", "ollama"] | None = None
    model: str | None = Field(default=None, max_length=120)
    task_types: list[str] | None = None
    permissions: list[Literal["read_messages", "draft_external", "read_catalog"]] | None = None
    monthly_budget: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    position: int | None = Field(default=None, ge=0, le=10_000)


class SourceIn(Strict):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.\-]+$")
    text: str = Field(min_length=1, max_length=20_000)


class TaskIn(Strict):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10_000)
    task_type: str = Field(min_length=1, max_length=64)
    assignee_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    status: Literal["backlog", "todo"] = "todo"
    due_date: date | None = None
    sources: list[SourceIn] = Field(default_factory=list, max_length=20)


class TaskPatch(Strict):
    version: int
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    assignee_id: uuid.UUID | None = None
    clear_assignee: bool = False
    project_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    status: Literal["backlog", "todo", "in_progress", "blocked", "cancelled"] | None = None
    due_date: date | None = None


class CommentIn(Strict):
    body: str = Field(min_length=1, max_length=5000)


class SubmitIn(Strict):
    """Output submitted by an external agent runtime (or a human acting as the agent)."""

    output: dict[str, Any]
    idempotency_key: str | None = Field(default=None, max_length=80)


class DecisionIn(Strict):
    decision: Literal["approved", "rejected", "changes_requested"]
    note: str = Field(default="", max_length=2000)


class NoteIn(Strict):
    note: str = Field(default="", max_length=2000)


class GoalIn(Strict):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    target_date: date | None = None
    status: Literal["active", "achieved", "dropped"] = "active"


class ProjectIn(Strict):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    goal_id: uuid.UUID | None = None
    status: Literal["active", "paused", "done"] = "active"


class ConnectionIn(Strict):
    api_key: str | None = Field(default=None, max_length=400)
    base_url: str | None = Field(default=None, max_length=300, pattern=r"^https?://")
    enabled: bool = True
    prices: dict[str, dict[str, str]] = Field(default_factory=dict)

    @field_validator("prices")
    @classmethod
    def check_prices(cls, value: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
        for model, price in value.items():
            if set(price) != {"input", "output"}:
                raise ValueError(f"{model}: give 'input' and 'output' prices per million tokens")
            for v in price.values():
                if Decimal(v) < 0:
                    raise ValueError("prices cannot be negative")
        return value


class UserIn(Strict):
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    name: str = Field(min_length=1, max_length=120)
    role: Literal["admin", "member", "viewer"] = "member"


# ---------------------------------------------------------------- accounts


class SetupIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=10, max_length=200)


class LoginIn(Strict):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)


class PasswordIn(Strict):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


class InviteIn(Strict):
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    role: Literal["admin", "member", "viewer"] = "member"


class AcceptIn(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=10, max_length=200)


class MemberPatch(Strict):
    role: Literal["owner", "admin", "member", "viewer"]


class TokenIn(Strict):
    name: str = Field(min_length=1, max_length=80)


# ---------------------------------------------------------------- operations


class MailboxIn(Strict):
    label: str = Field(min_length=1, max_length=80)
    address: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    display_name: str = Field(default="", max_length=120)
    imap_host: str | None = Field(default=None, max_length=255, pattern=r"^[A-Za-z0-9.\-]+$")
    imap_port: int = Field(default=993, ge=1, le=65535)
    imap_security: Literal["ssl", "starttls", "none"] = "ssl"
    imap_username: str = Field(default="", max_length=254)
    imap_password: str | None = Field(default=None, max_length=400)
    imap_folder: str = Field(default="INBOX", min_length=1, max_length=120)
    smtp_host: str | None = Field(default=None, max_length=255, pattern=r"^[A-Za-z0-9.\-]+$")
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_security: Literal["ssl", "starttls", "none"] = "ssl"
    smtp_username: str = Field(default="", max_length=254)
    smtp_password: str | None = Field(default=None, max_length=400)
    inbound_enabled: bool = False
    outbound_enabled: bool = False
    poll_seconds: int = Field(default=120, ge=60, le=86_400)
    import_days: int = Field(default=0, ge=0, le=14)


class MessageTaskIn(Strict):
    task_type: str = Field(min_length=1, max_length=64)
    assignee_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)


class DeliverySendIn(Strict):
    confirm_resend: bool = False


class DeliveryMarkIn(Strict):
    status: Literal["sent", "cancelled"]
    note: str = Field(default="", max_length=500)


class RoutineIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    cron: str = Field(min_length=9, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    enabled: bool = True
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10_000)
    task_type: str = Field(min_length=1, max_length=64)
    assignee_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    priority: Literal["low", "medium", "high", "urgent"] = "medium"


class RoutinePatch(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    cron: str | None = Field(default=None, min_length=9, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    enabled: bool | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    task_type: str | None = Field(default=None, min_length=1, max_length=64)
    assignee_id: uuid.UUID | None = None
    clear_assignee: bool = False
    priority: Literal["low", "medium", "high", "urgent"] | None = None


class SchedulePreviewIn(Strict):
    cron: str = Field(min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)


class ApplyTemplateIn(Strict):
    template: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9_\-]+$")
    provider: Literal["anthropic", "openai", "gemini", "ollama"] | None = None
    model: str | None = Field(default=None, max_length=120)


class AgentsModelIn(Strict):
    provider: Literal["anthropic", "openai", "gemini", "ollama"]
    model: str = Field(min_length=1, max_length=120)
    only_unset: bool = False


def iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def money(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")


def company_out(c: Company, role: str) -> dict[str, Any]:
    from .company_profile import settings_for

    return {
        "id": str(c.id),
        "name": c.name,
        "slug": c.slug,
        "currency": c.currency,
        "monthly_budget": money(c.monthly_budget),
        "is_demo": c.is_demo,
        "emergency_stop": c.emergency_stop,
        "policy": c.policy or {},
        "catalog": c.catalog or [],
        "country": c.country,
        "timezone": c.timezone,
        "language": c.language,
        "vat_rates": c.vat_rates or [],
        "settings": settings_for(c),
        "role": role,
        "created_at": iso(c.created_at),
    }


def agent_out(a: Agent, trust: list[Trust] | None = None, connected: bool | None = None) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "name": a.name,
        "role": a.role,
        "description": a.description,
        "objectives": a.objectives,
        "instructions": a.instructions,
        "manager_id": str(a.manager_id) if a.manager_id else None,
        "position": a.position,
        "provider": a.provider,
        "model": a.model,
        "task_types": a.task_types or [],
        "permissions": a.permissions or [],
        "monthly_budget": money(a.monthly_budget),
        "status": a.status,
        "version": a.version,
        "is_demo_agent": bool((a.config or {}).get("demo_key")),
        # "connected" is only true when a live run could actually start.
        "connected": connected,
        "trust": [trust_out(t) for t in (trust or [])],
        "created_at": iso(a.created_at),
        "updated_at": iso(a.updated_at),
    }


def trust_out(t: Trust) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "agent_id": str(t.agent_id),
        "task_type": t.task_type,
        "level": t.level,
        "streak": t.streak,
        "successes": t.successes,
        "failures": t.failures,
        "frozen": t.frozen,
        "updated_at": iso(t.updated_at),
    }


def trust_event_out(e: TrustEvent, agent_name: str | None = None) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "agent_id": str(e.agent_id),
        "agent_name": agent_name,
        "task_type": e.task_type,
        "kind": e.kind,
        "from_level": e.from_level,
        "to_level": e.to_level,
        "reason": e.reason,
        "receipt_id": str(e.receipt_id) if e.receipt_id else None,
        "actor": e.actor,
        "is_demo": e.is_demo,
        "created_at": iso(e.created_at),
    }


def task_out(t: Task, assignee: Agent | None = None) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "number": t.number,
        "key": f"T-{t.number}",
        "title": t.title,
        "description": t.description,
        "task_type": t.task_type,
        "assignee_id": str(t.assignee_id) if t.assignee_id else None,
        "assignee_name": assignee.name if assignee else None,
        "project_id": str(t.project_id) if t.project_id else None,
        "goal_id": str(t.goal_id) if t.goal_id else None,
        "parent_id": str(t.parent_id) if t.parent_id else None,
        "priority": t.priority,
        "status": t.status,
        "due_date": iso(t.due_date),
        "inputs": t.inputs or {},
        "result": t.result,
        "attempts": t.attempts,
        "version": t.version,
        "is_demo": t.is_demo,
        "origin": t.origin,
        "message_id": str(t.message_id) if t.message_id else None,
        "routine_id": str(t.routine_id) if t.routine_id else None,
        "archived": t.archived_at is not None,
        "created_at": iso(t.created_at),
        "updated_at": iso(t.updated_at),
    }


def run_out(r: Run) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "task_id": str(r.task_id),
        "agent_id": str(r.agent_id) if r.agent_id else None,
        "attempt": r.attempt,
        "mode": r.mode,
        "status": r.status,
        "output": r.output,
        "log": r.log,
        "error": r.error,
        "provider": r.provider,
        "model": r.model,
        "input_tokens": r.input_tokens,
        "output_tokens": r.output_tokens,
        "started_at": iso(r.started_at),
        "finished_at": iso(r.finished_at),
    }


def receipt_out(r: ReceiptRow) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "run_id": str(r.run_id),
        "task_id": str(r.task_id),
        "agent_id": str(r.agent_id) if r.agent_id else None,
        "contract_id": r.contract_id,
        "contract_version": r.contract_version,
        "contract_sha256": r.contract_sha256,
        "status": r.status,
        "body": r.body,
        "is_demo": r.is_demo,
        "created_at": iso(r.created_at),
    }


def approval_out(
    a: Approval, task: Task | None = None, agent: Agent | None = None, receipt: ReceiptRow | None = None
) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "task_id": str(a.task_id),
        "task_key": f"T-{task.number}" if task else None,
        "task_title": task.title if task else None,
        "task_type": task.task_type if task else None,
        "agent_id": str(a.agent_id) if a.agent_id else None,
        "agent_name": agent.name if agent else None,
        "reason": a.reason,
        "action": a.action,
        "payload": a.payload,
        "status": a.status,
        "decided_by": a.decided_by,
        "decided_at": iso(a.decided_at),
        "note": a.note,
        "is_demo": a.is_demo,
        "receipt": receipt_out(receipt) if receipt else None,
        "created_at": iso(a.created_at),
    }


def comment_out(c: TaskComment) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "author_type": c.author_type,
        "author_name": c.author_name,
        "body": c.body,
        "created_at": iso(c.created_at),
    }


def audit_out(e: AuditEvent) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "actor_type": e.actor_type,
        "actor_id": e.actor_id,
        "actor_name": e.actor_name,
        "kind": e.kind,
        "entity_type": e.entity_type,
        "entity_id": e.entity_id,
        "summary": e.summary,
        "data": e.data,
        "is_demo": e.is_demo,
        "created_at": iso(e.created_at),
    }


def goal_out(g: Goal) -> dict[str, Any]:
    return {
        "id": str(g.id),
        "title": g.title,
        "description": g.description,
        "status": g.status,
        "target_date": iso(g.target_date),
        "created_at": iso(g.created_at),
    }


def project_out(p: Project) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "goal_id": str(p.goal_id) if p.goal_id else None,
        "created_at": iso(p.created_at),
    }


def connection_out(c: ProviderConnection) -> dict[str, Any]:
    return {
        "provider": c.provider,
        "enabled": c.enabled,
        "has_key": bool(c.secret_encrypted),
        "key_hint": c.secret_hint,
        "base_url": c.base_url,
        "models": c.models or [],
        "prices": c.prices or {},
        "last_test_at": iso(c.last_test_at),
        "last_test_ok": c.last_test_ok,
        "last_error": c.last_error,
    }


def user_out(u: User) -> dict[str, Any]:
    return {"id": str(u.id), "email": u.email, "name": u.name, "has_password": u.password_hash is not None}


def token_out(t: ApiToken) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "name": t.name,
        "created_at": iso(t.created_at),
        "last_used_at": iso(t.last_used_at),
    }


def invitation_out(i: Invitation) -> dict[str, Any]:
    return {
        "id": str(i.id),
        "email": i.email,
        "role": i.role,
        "created_at": iso(i.created_at),
        "expires_at": iso(i.expires_at),
        "accepted_at": iso(i.accepted_at),
    }


def mailbox_out(m: MailAccount) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "label": m.label,
        "address": m.address,
        "display_name": m.display_name,
        "imap_host": m.imap_host,
        "imap_port": m.imap_port,
        "imap_security": m.imap_security,
        "imap_username": m.imap_username,
        "imap_folder": m.imap_folder,
        "has_imap_password": bool(m.imap_password_encrypted),
        "smtp_host": m.smtp_host,
        "smtp_port": m.smtp_port,
        "smtp_security": m.smtp_security,
        "smtp_username": m.smtp_username,
        "has_smtp_password": bool(m.smtp_password_encrypted),
        "inbound_enabled": m.inbound_enabled,
        "outbound_enabled": m.outbound_enabled,
        "poll_seconds": m.poll_seconds,
        "import_days": m.import_days,
        "reading_since_set": m.imap_last_uid is not None,
        "last_poll_at": iso(m.last_poll_at),
        "last_poll_ok": m.last_poll_ok,
        "last_poll_error": m.last_poll_error,
        "last_smtp_test_at": iso(m.last_smtp_test_at),
        "last_smtp_test_ok": m.last_smtp_test_ok,
        "last_smtp_error": m.last_smtp_error,
        "created_at": iso(m.created_at),
    }


def message_out(m: MailMessage, mailbox: MailAccount | None = None, *, full: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(m.id),
        "mailbox_id": str(m.mail_account_id) if m.mail_account_id else None,
        "mailbox": mailbox.address if mailbox else None,
        "from_address": m.from_address,
        "from_name": m.from_name,
        "reply_to": m.reply_to,
        "to": m.to_addresses,
        "subject": m.subject,
        "snippet": " ".join(m.text.split())[:180],
        "attachments": m.attachments or [],
        "automatic": m.automatic,
        "status": m.status,
        "status_note": m.status_note,
        "received_at": iso(m.received_at),
        "created_at": iso(m.created_at),
    }
    if full:
        out["text"] = m.text
        out["message_id"] = m.message_id
    return out


def delivery_out(d: Delivery, task: Task | None = None, mailbox: MailAccount | None = None) -> dict[str, Any]:
    return {
        "id": str(d.id),
        "task_id": str(d.task_id),
        "task_key": f"T-{task.number}" if task else None,
        "task_title": task.title if task else None,
        "approval_id": str(d.approval_id) if d.approval_id else None,
        "mailbox": mailbox.address if mailbox else None,
        "action": d.action,
        "to": d.to_address,
        "subject": d.subject,
        "body": d.body,
        "message_id": d.message_id,
        "status": d.status,
        "status_note": d.status_note,
        "attempts": d.attempts,
        "last_error": d.last_error,
        "approved_by": d.approved_by,
        "created_at": iso(d.created_at),
        "updated_at": iso(d.updated_at),
        "sent_at": iso(d.sent_at),
    }


def routine_out(r: Routine, assignee: Agent | None = None, upcoming: list[Any] | None = None) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "name": r.name,
        "cron": r.cron,
        "timezone": r.timezone,
        "enabled": r.enabled,
        "title": r.title,
        "description": r.description,
        "task_type": r.task_type,
        "assignee_id": str(r.assignee_id) if r.assignee_id else None,
        "assignee_name": assignee.name if assignee else None,
        "project_id": str(r.project_id) if r.project_id else None,
        "priority": r.priority,
        "next_run_at": iso(r.next_run_at),
        "last_run_at": iso(r.last_run_at),
        "last_task_id": str(r.last_task_id) if r.last_task_id else None,
        "runs_count": r.runs_count,
        "upcoming": [iso(x) for x in (upcoming or [])],
        "created_by": r.created_by,
        "created_at": iso(r.created_at),
    }
