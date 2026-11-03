"""Provider connections, demo mode and job status."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from . import demo, jobs
from .audit import record
from .auth import CompanyDep, DbDep, PrincipalDep
from .models import Job, Membership, ProviderConnection
from .providers import PROVIDERS, build
from .security import decrypt, encrypt, hint
from .views import ConnectionIn, company_out, connection_out

router = APIRouter(prefix="/api")


@router.get("/providers")
def providers() -> list[dict[str, Any]]:
    return [
        {"id": p.id, "label": p.label, "needs_key": p.needs_key, "default_base_url": p.default_base_url, "docs": p.docs}
        for p in PROVIDERS.values()
    ]


def _connection(db: DbDep, company_id: uuid.UUID, provider: str) -> ProviderConnection | None:
    return db.scalar(
        select(ProviderConnection).where(
            ProviderConnection.company_id == company_id, ProviderConnection.provider == provider
        )
    )


@router.get("/companies/{company_id}/connections")
def list_connections(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    rows = {
        c.provider: c
        for c in db.scalars(select(ProviderConnection).where(ProviderConnection.company_id == ctx.company.id))
    }
    out = []
    for p in PROVIDERS.values():
        conn = rows.get(p.id)
        base = {
            "provider": p.id,
            "label": p.label,
            "needs_key": p.needs_key,
            "docs": p.docs,
            "default_base_url": p.default_base_url,
        }
        out.append({**base, "configured": conn is not None, **(connection_out(conn) if conn else {})})
    return out


@router.put("/companies/{company_id}/connections/{provider}")
def put_connection(provider: str, body: ConnectionIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("admin")
    if provider not in PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown provider.")
    conn = _connection(db, ctx.company.id, provider)
    if conn is None:
        if PROVIDERS[provider].needs_key and not body.api_key:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "This provider needs an API key.")
        conn = ProviderConnection(company_id=ctx.company.id, provider=provider)
        db.add(conn)
    if body.api_key:
        conn.secret_encrypted = encrypt(body.api_key)
        conn.secret_hint = hint(body.api_key)
        conn.last_test_ok = None
    conn.base_url = body.base_url
    conn.enabled = body.enabled
    conn.prices = body.prices
    db.flush()
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "connection.updated",
        "connection",
        conn.id,
        f"{PROVIDERS[provider].label} connection saved ({'enabled' if body.enabled else 'disabled'})"
        + ("; key replaced" if body.api_key else ""),
    )
    db.commit()
    return connection_out(conn)


@router.post("/companies/{company_id}/connections/{provider}/test")
def test_connection(provider: str, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    """Calls the provider's model list. Never sends company data."""
    ctx.require("admin")
    conn = _connection(db, ctx.company.id, provider)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Save the connection first.")
    conn.last_test_at = datetime.now(UTC)
    try:
        secret = decrypt(conn.secret_encrypted) if conn.secret_encrypted else None
        models = build(provider, secret, conn.base_url).list_models(timeout=15)
        conn.models, conn.last_test_ok, conn.last_error = models[:200], True, None
    except Exception as exc:  # noqa: BLE001 - any failure is reported to the user and stored, never swallowed
        conn.last_test_ok, conn.last_error = False, str(exc)[:1000]
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "connection.tested",
        "connection",
        conn.id,
        f"{PROVIDERS[provider].label} test: {'ok' if conn.last_test_ok else 'failed'}",
        {"error": conn.last_error},
    )
    db.commit()
    return connection_out(conn)


@router.delete("/companies/{company_id}/connections/{provider}")
def delete_connection(provider: str, ctx: CompanyDep, db: DbDep) -> dict[str, str]:
    ctx.require("admin")
    conn = _connection(db, ctx.company.id, provider)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such connection.")
    db.delete(conn)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "connection.deleted",
        "connection",
        conn.id,
        f"{PROVIDERS[provider].label} connection removed; its key was erased",
    )
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------- demo


@router.post("/demo")
def open_demo(principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    company = demo.setup(db, principal.user_id)
    return company_out(company, "owner")


@router.post("/demo/run", status_code=202)
def run_demo(principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    company = demo.setup(db, principal.user_id)
    running = db.scalar(
        select(Job).where(Job.kind == "demo_week", Job.company_id == company.id, Job.status.in_(("queued", "running")))
    )
    if running:
        return {"job_id": str(running.id), "company_id": str(company.id), "status": running.status}
    job = jobs.enqueue(db, "demo_week", {"user_id": str(principal.user_id)}, company_id=None, max_attempts=1)
    db.commit()
    return {"job_id": str(job.id), "company_id": str(company.id), "status": "queued"}


@router.post("/demo/reset")
def reset_demo(principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    company = demo.reset(db, principal.user_id)
    return company_out(company, "owner")


@router.get("/jobs/{job_id}")
def job_status(job_id: uuid.UUID, principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    job = db.get(Job, job_id)
    allowed = False
    if job is not None and job.kind == "demo_week":
        allowed = str(job.payload.get("user_id")) == str(principal.user_id)
    elif job is not None and job.company_id is not None:
        allowed = (
            db.scalar(
                select(Membership).where(
                    Membership.company_id == job.company_id, Membership.user_id == principal.user_id
                )
            )
            is not None
        )
    if job is None or not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")
    return {
        "id": str(job.id),
        "kind": job.kind,
        "status": job.status,
        "progress": job.progress,
        "error": job.last_error,
        "attempts": job.attempts,
    }
