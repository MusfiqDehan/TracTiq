import json
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(slots=True)
class DomainEvent:
    """Typed domain event emitted by module services on state mutations."""

    event_type: str
    company_id: str
    team_id: str
    actor_id: str
    entity_type: str
    entity_id: str
    occurred_at: datetime
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    skip_audit: bool = False


RealtimeHook = Callable[[DomainEvent], Awaitable[None]]


class EventBus:
    """Coordinates transactional audit trail recording and post-commit realtime fan-out."""

    def __init__(self) -> None:
        self._realtime_hooks: list[RealtimeHook] = []

    def subscribe_realtime(self, hook: RealtimeHook) -> None:
        if hook not in self._realtime_hooks:
            self._realtime_hooks.append(hook)

    async def stage_in_tx(self, session: AsyncSession, event: DomainEvent) -> None:
        """Persist audit trail and schedule Postgres NOTIFY atomically in the active tx."""
        if not event.skip_audit:
            from app.modules.audit.models import AuditLog

            audit_entry = AuditLog(
                id=f"aud_{uuid.uuid4().hex[:16]}",
                company_id=event.company_id,
                team_id=event.team_id,
                actor_id=event.actor_id,
                action=event.event_type,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                before_state=event.before_state,
                after_state=event.after_state,
                created_at=event.occurred_at,
            )
            session.add(audit_entry)

        notify_payload = json.dumps(
            {
                "event_type": event.event_type,
                "company_id": event.company_id,
                "team_id": event.team_id,
                "actor_id": event.actor_id,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "occurred_at": event.occurred_at.isoformat(),
                "payload": event.payload,
            },
            default=str,
        )
        # PostgreSQL delivers pg_notify only when the surrounding transaction commits.
        if len(notify_payload.encode("utf-8")) < 7500:
            await session.execute(
                text("SELECT pg_notify('tractiq_realtime', :payload)"),
                {"payload": notify_payload},
            )

    async def publish_committed(self, event: DomainEvent) -> None:
        """Notify in-process WebSocket subscribers after transaction commit."""
        for hook in self._realtime_hooks:
            await hook(event)


event_bus = EventBus()
