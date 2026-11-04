"""Database schema. Every company-owned row carries company_id; queries always filter on it."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

Json = JSON().with_variant(JSONB(), "postgresql")


def now() -> datetime:
    return datetime.now(UTC)


def new_id() -> uuid.UUID:
    return uuid.uuid4()


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    monthly_budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    emergency_stop: Mapped[bool] = mapped_column(Boolean, default=False)
    # Autonomy policy: thresholds and sampling. Hypotheses to calibrate, not proven values.
    policy: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    catalog: Mapped[list[dict[str, Any]]] = mapped_column(Json, default=list)
    # Where the company operates: drives the allowed VAT rates, the currency and the time zone of routines.
    country: Mapped[str] = mapped_column(String(2), default="DE", server_default="DE")
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Berlin", server_default="Europe/Berlin")
    # Language agents write to customers in when the customer's own language is unclear.
    language: Mapped[str] = mapped_column(String(8), default="en", server_default="en")
    vat_rates: Mapped[list[str]] = mapped_column(
        Json, default=lambda: ["0.19", "0.07", "0"], server_default='["0.19", "0.07", "0"]'
    )
    # Operations: auto-run, routing of triaged messages, outbound limits, e-mail signature.
    settings: Mapped[dict[str, Any]] = mapped_column(Json, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    # Argon2id hash; None for the implicit local owner and for users who only use API tokens.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UserSession(Base):
    """A signed-in browser. Only the SHA-256 of the cookie value is stored."""

    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_email_created", "email", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254))
    ip: Mapped[str | None] = mapped_column(String(64))
    ok: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (CheckConstraint("role in ('admin','member','viewer')", name="invitation_role"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(254))
    role: Mapped[str] = mapped_column(String(16))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("company_id", "user_id"),
        CheckConstraint("role in ('owner','admin','member','viewer')", name="membership_role"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(16))


class ApiToken(Base):
    __tablename__ = "api_tokens"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        CheckConstraint("status in ('active','paused','archived')", name="agent_status"),
        Index("ix_agents_company", "company_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    objectives: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(120))
    config: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    # Task types (contract ids) this agent may work on. Empty = none.
    task_types: Mapped[list[str]] = mapped_column(Json, default=list)
    # Capabilities such as "read_messages", "draft_external". Sending is never a capability:
    # external effects are performed by the server after the approval rules.
    permissions: Mapped[list[str]] = mapped_column(Json, default=list)
    monthly_budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(16), default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Goal(Base):
    __tablename__ = "goals"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="active")
    target_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    goal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


TASK_STATUSES = ("backlog", "todo", "in_progress", "awaiting_approval", "blocked", "done", "cancelled")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(f"status in {TASK_STATUSES!r}".replace('"', "'"), name="task_status"),
        CheckConstraint("priority in ('low','medium','high','urgent')", name="task_priority"),
        Index("ix_tasks_company_status", "company_id", "status"),
        Index("ix_tasks_company_updated", "company_id", "updated_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(64))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    priority: Mapped[str] = mapped_column(String(8), default="medium")
    status: Mapped[str] = mapped_column(String(20), default="todo")
    due_date: Mapped[date | None] = mapped_column(Date)
    # Untrusted external content (e-mails, requests). Treated as data, never as instructions.
    inputs: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(Json)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(String(80), default="user")
    # How the task arrived: user | mail | routing | routine | api | demo
    origin: Mapped[str] = mapped_column(String(16), default="user", server_default="user")
    # The e-mail this task answers, when it came from a mailbox.
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("mail_messages.id", ondelete="SET NULL", name="fk_tasks_message"), index=True
    )
    routine_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("routines.id", ondelete="SET NULL", name="fk_tasks_routine")
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class TaskComment(Base):
    __tablename__ = "task_comments"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author_type: Mapped[str] = mapped_column(String(16))
    author_id: Mapped[str] = mapped_column(String(64))
    author_name: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint("mode in ('live','demo','submitted')", name="run_mode"),
        CheckConstraint("status in ('queued','running','succeeded','failed','cancelled')", name="run_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    mode: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(12), default="queued")
    output: Mapped[dict[str, Any] | None] = mapped_column(Json)
    log: Mapped[list[dict[str, Any]]] = mapped_column(Json, default=list)
    error: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(120))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ReceiptRow(Base):
    __tablename__ = "receipts"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), unique=True)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    contract_id: Mapped[str] = mapped_column(String(64))
    contract_version: Mapped[int] = mapped_column(Integer)
    contract_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(12))
    body: Mapped[dict[str, Any]] = mapped_column(Json)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Approval(Base):
    __tablename__ = "approvals"
    __table_args__ = (
        CheckConstraint(
            "status in ('pending','approved','rejected','changes_requested','superseded')", name="approval_status"
        ),
        Index("ix_approvals_company_status", "company_id", "status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("receipts.id", ondelete="SET NULL"))
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    # Why a human is asked: supervised | sampled | contract_always | risk_cap | verification_failed
    reason: Mapped[str] = mapped_column(String(32))
    action: Mapped[str | None] = mapped_column(String(64))
    # The exact payload that would leave Select, shown to the human before approval.
    payload: Mapped[dict[str, Any]] = mapped_column(Json)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decided_by: Mapped[str | None] = mapped_column(String(120))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


LEVELS = ("supervised", "sampled", "autonomous")


class Trust(Base):
    __tablename__ = "trust"
    __table_args__ = (
        UniqueConstraint("agent_id", "task_type"),
        CheckConstraint("level in ('supervised','sampled','autonomous')", name="trust_level"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    task_type: Mapped[str] = mapped_column(String(64))
    level: Mapped[str] = mapped_column(String(12), default="supervised")
    streak: Mapped[int] = mapped_column(Integer, default=0)
    successes: Mapped[int] = mapped_column(Integer, default=0)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    # Set by a human revocation: no automatic promotion until a human clears it.
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class TrustEvent(Base):
    __tablename__ = "trust_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    trust_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trust.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    task_type: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))  # promote | demote | revoke | unfreeze | reset
    from_level: Mapped[str] = mapped_column(String(12))
    to_level: Mapped[str] = mapped_column(String(12))
    reason: Mapped[str] = mapped_column(Text)
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("receipts.id", ondelete="SET NULL"))
    actor: Mapped[str] = mapped_column(String(120))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Outcome(Base):
    """One verified-or-not result per finished task attempt; feeds the autonomy counter."""

    __tablename__ = "outcomes"
    __table_args__ = (Index("ix_outcomes_company_created", "company_id", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    task_type: Mapped[str] = mapped_column(String(64))
    level_at_run: Mapped[str] = mapped_column(String(12))
    # True when the task finished without any human intervention.
    autonomous: Mapped[bool] = mapped_column(Boolean)
    verified: Mapped[bool] = mapped_column(Boolean)
    # Set later if a human (sample review, complaint) finds an error the checks missed.
    undetected_error: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CostEvent(Base):
    __tablename__ = "cost_events"
    __table_args__ = (
        CheckConstraint("kind in ('actual','estimated')", name="cost_kind"),
        Index("ix_costs_company_created", "company_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("runs.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(120))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    kind: Mapped[str] = mapped_column(String(10))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_company_created", "company_id", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    actor_type: Mapped[str] = mapped_column(String(12))  # user | agent | system | demo
    actor_id: Mapped[str] = mapped_column(String(64))
    actor_name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(48))
    entity_type: Mapped[str] = mapped_column(String(24))
    entity_id: Mapped[str] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(Text)
    data: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ProviderConnection(Base):
    __tablename__ = "provider_connections"
    __table_args__ = (UniqueConstraint("company_id", "provider"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(32))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    secret_encrypted: Mapped[str | None] = mapped_column(Text)
    secret_hint: Mapped[str | None] = mapped_column(String(16))
    base_url: Mapped[str | None] = mapped_column(String(300))
    models: Mapped[list[str]] = mapped_column(Json, default=list)
    # Price per million tokens used to estimate cost: {"model": {"input": "3.00", "output": "15.00"}}
    prices: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    last_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean)
    last_error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


MAIL_SECURITY = ("ssl", "starttls", "none")


class MailAccount(Base):
    """A company mailbox: IMAP to read incoming mail, SMTP to send approved replies.

    Passwords are encrypted like provider keys and never returned by the API.
    """

    __tablename__ = "mail_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "address"),
        CheckConstraint("imap_security in ('ssl','starttls','none')", name="mail_imap_security"),
        CheckConstraint("smtp_security in ('ssl','starttls','none')", name="mail_smtp_security"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(String(254))
    display_name: Mapped[str] = mapped_column(String(120), default="")
    imap_host: Mapped[str | None] = mapped_column(String(255))
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_security: Mapped[str] = mapped_column(String(10), default="ssl")
    imap_username: Mapped[str] = mapped_column(String(254), default="")
    imap_password_encrypted: Mapped[str | None] = mapped_column(Text)
    imap_folder: Mapped[str] = mapped_column(String(120), default="INBOX")
    smtp_host: Mapped[str | None] = mapped_column(String(255))
    smtp_port: Mapped[int] = mapped_column(Integer, default=465)
    smtp_security: Mapped[str] = mapped_column(String(10), default="ssl")
    smtp_username: Mapped[str] = mapped_column(String(254), default="")
    smtp_password_encrypted: Mapped[str | None] = mapped_column(Text)
    inbound_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    outbound_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    poll_seconds: Mapped[int] = mapped_column(Integer, default=120)
    # On the first poll Select remembers where the mailbox stands and only imports newer mail,
    # plus the last `import_days` days if asked.
    import_days: Mapped[int] = mapped_column(Integer, default=0)
    imap_uidvalidity: Mapped[int | None] = mapped_column(BigInteger)
    imap_last_uid: Mapped[int | None] = mapped_column(BigInteger)
    last_poll_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_poll_ok: Mapped[bool | None] = mapped_column(Boolean)
    last_poll_error: Mapped[str | None] = mapped_column(Text)
    last_smtp_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_smtp_test_ok: Mapped[bool | None] = mapped_column(Boolean)
    last_smtp_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


MESSAGE_STATUSES = ("new", "triage", "routed", "needs_human", "handled", "ignored", "failed")


class MailMessage(Base):
    """An incoming e-mail. Its content is untrusted data, never instructions."""

    __tablename__ = "mail_messages"
    __table_args__ = (
        UniqueConstraint("mail_account_id", "message_id"),
        CheckConstraint(f"status in {MESSAGE_STATUSES!r}".replace('"', "'"), name="mail_message_status"),
        Index("ix_mail_messages_company_received", "company_id", "received_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    mail_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mail_accounts.id", ondelete="SET NULL"))
    uidvalidity: Mapped[int | None] = mapped_column(BigInteger)
    uid: Mapped[int | None] = mapped_column(BigInteger)
    message_id: Mapped[str] = mapped_column(String(500))
    in_reply_to: Mapped[str | None] = mapped_column(String(500))
    references: Mapped[str | None] = mapped_column(Text)
    from_address: Mapped[str] = mapped_column(String(254), default="")
    from_name: Mapped[str] = mapped_column(String(200), default="")
    reply_to: Mapped[str | None] = mapped_column(String(254))
    to_addresses: Mapped[str] = mapped_column(Text, default="")
    subject: Mapped[str] = mapped_column(String(500), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(Json, default=list)
    automatic: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default="new")
    status_note: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


DELIVERY_STATUSES = ("ready", "held", "queued", "sending", "sent", "failed", "uncertain", "cancelled")


class Delivery(Base):
    """One outgoing e-mail for one verified result. Sent at most once.

    ready: verified and approved but no outgoing mailbox is configured.
    held: waiting for a human (hourly limit reached or emergency stop).
    uncertain: the connection broke after the message was handed over; never resent automatically.
    """

    __tablename__ = "deliveries"
    __table_args__ = (
        UniqueConstraint("task_id", "run_id"),
        CheckConstraint(f"status in {DELIVERY_STATUSES!r}".replace('"', "'"), name="delivery_status"),
        Index("ix_deliveries_company_created", "company_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("runs.id", ondelete="SET NULL"))
    approval_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("approvals.id", ondelete="SET NULL"))
    mail_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mail_accounts.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64))
    to_address: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    in_reply_to: Mapped[str | None] = mapped_column(String(500))
    references: Mapped[str | None] = mapped_column(Text)
    message_id: Mapped[str] = mapped_column(String(500), unique=True)
    status: Mapped[str] = mapped_column(String(12))
    status_note: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    smtp_response: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[str] = mapped_column(String(120))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Routine(Base):
    """A task created on a schedule (cron expression evaluated in the routine's time zone)."""

    __tablename__ = "routines"
    __table_args__ = (
        CheckConstraint("priority in ('low','medium','high','urgent')", name="routine_priority"),
        Index("ix_routines_due", "enabled", "next_run_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    cron: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(64))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    priority: Mapped[str] = mapped_column(String(8), default="medium")
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL", use_alter=True, name="fk_routines_last_task")
    )
    runs_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Job(Base):
    """Durable work queue on PostgreSQL (claimed with FOR UPDATE SKIP LOCKED)."""

    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_run_after", "status", "run_after"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_id)
    company_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    status: Mapped[str] = mapped_column(String(12), default="queued")  # queued|running|done|failed|cancelled
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    progress: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(String(80))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
