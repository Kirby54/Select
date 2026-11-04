"""Authentication and company-scoped authorization, checked on the server for every request.

Modes (SELECT_AUTH_MODE):
- local: one implicit owner, for a machine you control.
- password: people sign in with e-mail and password; the session lives in an HttpOnly cookie.
  Requests that change something must also carry the header ``x-select-csrf: 1``, which a
  foreign site cannot add to a browser request. API tokens (Bearer) are accepted as well.
- token: every request carries ``Authorization: Bearer <token>``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Path, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ApiToken, Company, Membership, User, UserSession
from .security import hash_token

LOCAL_EMAIL = "owner@localhost"
ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}
SESSION_COOKIE = "select_session"
CSRF_HEADER = "x-select-csrf"
SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class AuthProblem(HTTPException):
    """An authentication failure with a machine-readable code the interface acts on."""

    def __init__(self, status_code: int, message: str, code: str) -> None:
        super().__init__(status_code, message)
        self.code = code


@dataclass(frozen=True)
class Actor:
    type: str  # user | agent | system | demo
    id: str
    name: str


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    email: str
    name: str
    session_id: uuid.UUID | None = None

    @property
    def actor(self) -> Actor:
        return Actor("user", str(self.user_id), self.name)


SYSTEM = Actor("system", "select", "Select")


def ensure_local_user(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == LOCAL_EMAIL))
    if user is None:
        user = User(email=LOCAL_EMAIL, name="Owner")
        db.add(user)
        db.flush()
    return user


def needs_setup(db: Session) -> bool:
    """True until the first account with a password exists (password mode only)."""
    return not db.scalar(select(func.count()).where(User.password_hash.is_not(None), User.disabled_at.is_(None)))


def _bearer(request: Request, db: Session) -> Principal | None:
    header = request.headers.get("authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthProblem(status.HTTP_401_UNAUTHORIZED, "Malformed Authorization header.", "auth_required")
    row = db.scalar(select(ApiToken).where(ApiToken.token_hash == hash_token(token), ApiToken.revoked_at.is_(None)))
    if row is None:
        raise AuthProblem(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked token.", "auth_required")
    user = db.get(User, row.user_id)
    if user is None or user.disabled_at is not None:
        raise AuthProblem(status.HTTP_401_UNAUTHORIZED, "This token's owner can no longer sign in.", "auth_required")
    row.last_used_at = datetime.now(UTC)
    db.commit()
    return Principal(user.id, user.email, user.name)


def session_principal(request: Request, db: Session) -> Principal | None:
    """The signed-in person behind the session cookie, or None. Never raises."""
    cookie = request.cookies.get(SESSION_COOKIE)
    if not cookie:
        return None
    session = db.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(cookie), UserSession.revoked_at.is_(None))
    )
    if session is None or session.expires_at <= datetime.now(UTC):
        return None
    user = db.get(User, session.user_id)
    if user is None or user.disabled_at is not None:
        return None
    return Principal(user.id, user.email, user.name, session_id=session.id)


def get_principal(request: Request, db: Annotated[Session, Depends(get_db)]) -> Principal:
    settings = get_settings()
    if settings.auth_mode == "local":
        user = ensure_local_user(db)
        db.commit()
        return Principal(user.id, user.email, user.name)
    principal = _bearer(request, db)
    if principal is not None:
        return principal
    if settings.auth_mode == "token":
        raise AuthProblem(
            status.HTTP_401_UNAUTHORIZED,
            "Missing bearer token. Create one with `select-api create-token`.",
            "token_required",
        )
    principal = session_principal(request, db)
    if principal is None:
        if needs_setup(db):
            raise AuthProblem(status.HTTP_401_UNAUTHORIZED, "Create the first account to start.", "setup_required")
        raise AuthProblem(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.", "auth_required")
    if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != "1":
        raise AuthProblem(status.HTTP_403_FORBIDDEN, "Missing anti-forgery header; reload the page.", "csrf")
    return principal


PrincipalDep = Annotated[Principal, Depends(get_principal)]
DbDep = Annotated[Session, Depends(get_db)]


@dataclass
class CompanyContext:
    company: Company
    role: str
    principal: Principal

    def require(self, minimum: str) -> None:
        if ROLE_RANK[self.role] < ROLE_RANK[minimum]:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action needs the '{minimum}' role; you are '{self.role}'. Ask an owner of this company.",
            )


def company_context(
    company_id: Annotated[uuid.UUID, Path()],
    principal: PrincipalDep,
    db: DbDep,
) -> CompanyContext:
    membership = db.scalar(
        select(Membership).where(Membership.company_id == company_id, Membership.user_id == principal.user_id)
    )
    company = db.get(Company, company_id) if membership else None
    # Same answer whether the company does not exist or belongs to someone else: no enumeration.
    if membership is None or company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")
    return CompanyContext(company=company, role=membership.role, principal=principal)


CompanyDep = Annotated[CompanyContext, Depends(company_context)]
