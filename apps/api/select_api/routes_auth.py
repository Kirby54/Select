"""Sign-in, sessions, API tokens, invitations and members."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select, text, update

from .audit import record
from .auth import (
    LOCAL_EMAIL,
    SESSION_COOKIE,
    Actor,
    AuthProblem,
    CompanyDep,
    DbDep,
    PrincipalDep,
    ensure_local_user,
    needs_setup,
    session_principal,
)
from .config import get_settings
from .models import ApiToken, Company, Invitation, LoginAttempt, Membership, User, UserSession
from .security import hash_password, hash_token, needs_rehash, new_token, verify_password
from .views import (
    AcceptIn,
    InviteIn,
    LoginIn,
    MemberPatch,
    PasswordIn,
    SetupIn,
    TokenIn,
    invitation_out,
    token_out,
    user_out,
)

router = APIRouter(prefix="/api")

FAILURES_ALLOWED = 10
FAILURE_WINDOW = timedelta(minutes=15)
INVITATION_DAYS = 7


def _now() -> datetime:
    return datetime.now(UTC)


def _require_password_mode() -> None:
    if get_settings().auth_mode != "password":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Sign-in with passwords is off. Start Select with SELECT_AUTH_MODE=password."
        )


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _start_session(db: DbDep, user: User, request: Request, response: Response) -> None:
    settings = get_settings()
    token = new_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=_now() + timedelta(days=settings.session_days),
            ip=_client_ip(request),
            user_agent=(request.headers.get("user-agent") or "")[:300],
        )
    )
    user.last_login_at = _now()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86_400,
        httponly=True,
        secure=settings.public_url.startswith("https://"),
        samesite="lax",
        path="/",
    )


def _user_by_email(db: DbDep, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))


@router.get("/auth/state")
def auth_state(request: Request, db: DbDep) -> dict[str, Any]:
    """What the interface needs before anything else: the mode, and who is signed in."""
    settings = get_settings()
    user: User | None = None
    if settings.auth_mode == "local":
        user = ensure_local_user(db)
        db.commit()
    elif settings.auth_mode == "password":
        principal = session_principal(request, db)
        user = db.get(User, principal.user_id) if principal else None
    return {
        "mode": settings.auth_mode,
        "needs_setup": settings.auth_mode == "password" and needs_setup(db),
        "user": user_out(user) if user else None,
    }


@router.post("/auth/setup", status_code=201)
def setup(body: SetupIn, request: Request, response: Response, db: DbDep) -> dict[str, Any]:
    """Creates the first owner account. Refused as soon as one account exists."""
    _require_password_mode()
    db.execute(text("select pg_advisory_xact_lock(2026110301)"))  # two first visitors cannot both win
    if not needs_setup(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account already exists. Sign in instead.")
    email = body.email.strip().lower()
    if email == LOCAL_EMAIL:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Use a real e-mail address.")
    user = _user_by_email(db, email)
    if user is None:
        user = User(email=email, name=body.name)
        db.add(user)
    user.name, user.password_hash = body.name, hash_password(body.password)
    db.flush()
    _start_session(db, user, request, response)
    db.commit()
    return user_out(user)


def user_actor(user: User) -> Actor:
    return Actor("user", str(user.id), user.name)


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: DbDep) -> dict[str, Any]:
    _require_password_mode()
    email = body.email.strip().lower()
    failures = db.scalar(
        select(func.count()).where(
            LoginAttempt.email == email, LoginAttempt.ok.is_(False), LoginAttempt.created_at >= _now() - FAILURE_WINDOW
        )
    )
    if (failures or 0) >= FAILURES_ALLOWED:
        raise AuthProblem(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed attempts for this e-mail. Wait 15 minutes, then try again.",
            "rate_limited",
        )
    user = _user_by_email(db, email)
    ok = verify_password(user.password_hash if user else None, body.password)
    ok = ok and user is not None and user.disabled_at is None
    db.add(LoginAttempt(email=email, ip=_client_ip(request), ok=ok))
    if not ok or user is None or user.password_hash is None:
        db.commit()
        raise AuthProblem(status.HTTP_401_UNAUTHORIZED, "Wrong e-mail or password.", "bad_credentials")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    _start_session(db, user, request, response)
    db.commit()
    return user_out(user)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: DbDep) -> dict[str, str]:
    cookie = request.cookies.get(SESSION_COOKIE)
    if cookie:
        db.execute(
            update(UserSession)
            .where(UserSession.token_hash == hash_token(cookie), UserSession.revoked_at.is_(None))
            .values(revoked_at=_now())
        )
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "signed out"}


@router.post("/auth/password")
def change_password(body: PasswordIn, principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    _require_password_mode()
    user = db.get(User, principal.user_id)
    if user is None or not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The current password is wrong.")
    user.password_hash = hash_password(body.new_password)
    # Every other browser is signed out; this one stays signed in.
    query = update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    if principal.session_id:
        query = query.where(UserSession.id != principal.session_id)
    ended = db.execute(query.values(revoked_at=_now())).rowcount  # type: ignore[attr-defined]
    db.commit()
    return {"status": "changed", "other_sessions_ended": int(ended or 0)}


# ---------------------------------------------------------------- API tokens


@router.get("/auth/tokens")
def list_tokens(principal: PrincipalDep, db: DbDep) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(ApiToken)
        .where(ApiToken.user_id == principal.user_id, ApiToken.revoked_at.is_(None))
        .order_by(ApiToken.created_at.desc())
    ).all()
    return [token_out(t) for t in rows]


@router.post("/auth/tokens", status_code=201)
def create_token(body: TokenIn, principal: PrincipalDep, db: DbDep) -> dict[str, Any]:
    token = new_token()
    row = ApiToken(user_id=principal.user_id, name=body.name, token_hash=hash_token(token))
    db.add(row)
    db.commit()
    return {**token_out(row), "token": token}


@router.delete("/auth/tokens/{token_id}")
def revoke_token(token_id: uuid.UUID, principal: PrincipalDep, db: DbDep) -> dict[str, str]:
    row = db.get(ApiToken, token_id)
    if row is None or row.user_id != principal.user_id or row.revoked_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found.")
    row.revoked_at = _now()
    db.commit()
    return {"status": "revoked"}


# ---------------------------------------------------------------- invitations


def _invitation_state(inv: Invitation) -> str:
    if inv.revoked_at:
        return "revoked"
    if inv.accepted_at:
        return "used"
    if inv.expires_at <= _now():
        return "expired"
    return "valid"


@router.post("/companies/{company_id}/invitations", status_code=201)
def invite(body: InviteIn, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("owner" if body.role == "admin" else "admin")
    _require_password_mode()
    if ctx.company.is_demo:
        raise HTTPException(status.HTTP_409_CONFLICT, "The demo company cannot have other members.")
    email = body.email.strip().lower()
    existing = _user_by_email(db, email)
    if existing is not None and db.scalar(
        select(Membership).where(Membership.company_id == ctx.company.id, Membership.user_id == existing.id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "This person is already a member.")
    token = new_token()
    invitation = Invitation(
        company_id=ctx.company.id,
        email=email,
        role=body.role,
        token_hash=hash_token(token),
        invited_by=ctx.principal.user_id,
        expires_at=_now() + timedelta(days=INVITATION_DAYS),
    )
    db.add(invitation)
    db.flush()
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "member.invited",
        "user",
        invitation.id,
        f"{email} invited as {body.role}",
    )
    db.commit()
    link = f"{get_settings().public_url.rstrip('/')}/invite/{token}"
    return {**invitation_out(invitation), "link": link}


@router.get("/companies/{company_id}/invitations")
def list_invitations(ctx: CompanyDep, db: DbDep) -> list[dict[str, Any]]:
    ctx.require("admin")
    rows = db.scalars(
        select(Invitation)
        .where(
            Invitation.company_id == ctx.company.id,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > _now(),
        )
        .order_by(Invitation.created_at.desc())
    ).all()
    return [invitation_out(i) for i in rows]


@router.delete("/companies/{company_id}/invitations/{invitation_id}")
def revoke_invitation(invitation_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, str]:
    ctx.require("admin")
    invitation = db.get(Invitation, invitation_id)
    if invitation is None or invitation.company_id != ctx.company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found.")
    invitation.revoked_at = _now()
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "member.invitation_revoked",
        "user",
        invitation.id,
        f"Invitation for {invitation.email} revoked",
    )
    db.commit()
    return {"status": "revoked"}


def _invitation_by_token(db: DbDep, token: str) -> Invitation:
    invitation = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invitation link is not valid.")
    return invitation


@router.get("/invitations/{token}")
def read_invitation(token: str, request: Request, db: DbDep) -> dict[str, Any]:
    """Public: what an invitation link is for. Shows nothing but the company name and the role."""
    invitation = _invitation_by_token(db, token)
    company = db.get(Company, invitation.company_id)
    inviter = db.get(User, invitation.invited_by) if invitation.invited_by else None
    user = _user_by_email(db, invitation.email)
    principal = session_principal(request, db)
    return {
        "company_name": company.name if company else None,
        "email": invitation.email,
        "role": invitation.role,
        "invited_by": inviter.name if inviter else None,
        "expires_at": invitation.expires_at.isoformat(),
        "state": _invitation_state(invitation),
        "account_exists": bool(user and user.password_hash),
        "signed_in_as": principal.email if principal else None,
    }


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, body: AcceptIn, request: Request, response: Response, db: DbDep) -> dict[str, Any]:
    _require_password_mode()
    invitation = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)).with_for_update())
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invitation link is not valid.")
    state = _invitation_state(invitation)
    if state != "valid":
        raise HTTPException(status.HTTP_410_GONE, f"This invitation is {state}. Ask for a new one.")
    principal = session_principal(request, db)
    if principal is not None:
        if principal.email.lower() != invitation.email:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"This invitation is for {invitation.email}; you are signed in as {principal.email}. "
                "Sign out, then open the link again.",
            )
        user = db.get(User, principal.user_id)
    else:
        user = _user_by_email(db, invitation.email)
        if user is not None and user.password_hash:
            raise AuthProblem(
                status.HTTP_409_CONFLICT,
                "An account already exists for this e-mail. Sign in, then open the link again.",
                "login_required",
            )
        if not body.name or not body.password:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Give your name and a password (10+ characters)."
            )
        if user is None:
            user = User(email=invitation.email, name=body.name)
            db.add(user)
        user.name, user.password_hash = body.name, hash_password(body.password)
        db.flush()
        _start_session(db, user, request, response)
    assert user is not None
    if not db.scalar(
        select(Membership).where(Membership.company_id == invitation.company_id, Membership.user_id == user.id)
    ):
        db.add(Membership(company_id=invitation.company_id, user_id=user.id, role=invitation.role))
    invitation.accepted_at, invitation.accepted_by = _now(), user.id
    record(
        db,
        invitation.company_id,
        user_actor(user),
        "member.joined",
        "user",
        user.id,
        f"{user.email} joined as {invitation.role}",
    )
    db.commit()
    return {"company_id": str(invitation.company_id), "user": user_out(user)}


# ---------------------------------------------------------------- members


def _owners(db: DbDep, company_id: uuid.UUID) -> int:
    return int(
        db.scalar(select(func.count()).where(Membership.company_id == company_id, Membership.role == "owner")) or 0
    )


def _membership(db: DbDep, company_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    membership = db.scalar(
        select(Membership).where(Membership.company_id == company_id, Membership.user_id == user_id).with_for_update()
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found.")
    return membership


@router.patch("/companies/{company_id}/members/{user_id}")
def change_role(user_id: uuid.UUID, body: MemberPatch, ctx: CompanyDep, db: DbDep) -> dict[str, Any]:
    ctx.require("owner")
    membership = _membership(db, ctx.company.id, user_id)
    if membership.role == "owner" and body.role != "owner" and _owners(db, ctx.company.id) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A company keeps at least one owner. Make someone else owner first."
        )
    previous, membership.role = membership.role, body.role
    user = db.get(User, user_id)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "member.role_changed",
        "user",
        user_id,
        f"{user.email if user else user_id}: {previous} → {body.role}",
    )
    db.commit()
    return {"id": str(user_id), "role": body.role}


@router.delete("/companies/{company_id}/members/{user_id}")
def remove_member(user_id: uuid.UUID, ctx: CompanyDep, db: DbDep) -> dict[str, str]:
    leaving = user_id == ctx.principal.user_id
    if not leaving:
        ctx.require("admin")
    membership = _membership(db, ctx.company.id, user_id)
    if membership.role == "owner" and not leaving:
        ctx.require("owner")
    if membership.role == "owner" and _owners(db, ctx.company.id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "The last owner cannot leave. Make someone else owner first.")
    user = db.get(User, user_id)
    db.delete(membership)
    record(
        db,
        ctx.company.id,
        ctx.principal.actor,
        "member.removed",
        "user",
        user_id,
        f"{user.email if user else user_id} " + ("left" if leaving else "removed"),
    )
    db.commit()
    return {"status": "removed"}
