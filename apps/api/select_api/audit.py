from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from .auth import Actor
from .models import AuditEvent


def record(
    db: Session,
    company_id: uuid.UUID,
    actor: Actor,
    kind: str,
    entity_type: str,
    entity_id: uuid.UUID | str,
    summary: str,
    data: dict[str, Any] | None = None,
    *,
    is_demo: bool = False,
) -> AuditEvent:
    event = AuditEvent(
        company_id=company_id,
        actor_type=actor.type,
        actor_id=actor.id,
        actor_name=actor.name,
        kind=kind,
        entity_type=entity_type,
        entity_id=str(entity_id),
        summary=summary,
        data=data or {},
        is_demo=is_demo,
    )
    db.add(event)
    return event
