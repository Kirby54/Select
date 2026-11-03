"""Authentication and company-scoped authorization, checked on the server for every request."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Path, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ApiToken, Company, Membership, User
from .security import hash_token

LOCAL_EMAIL = "owner@localhost"
ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}


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


def get_principal(request: Request, db: Annotated[Session, Depends(get_db)]) -> Principal:
    settings = get_settings()
    if settings.auth_mode == "local":
        user = ensure_local_user(db)
        db.commit()
        return Principal(user.id, user.email, user.name)
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Missing bearer token. Create one with `select-api create-token`."
        )
    row = db.scalar(select(ApiToken).where(ApiToken.token_hash == hash_token(token), ApiToken.revoked_at.is_(None)))
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked token.")
    row.last_used_at = datetime.now(UTC)
    user = db.get(User, row.user_id)
    db.commit()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token owner no longer exists.")
    return Principal(user.id, user.email, user.name)


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
