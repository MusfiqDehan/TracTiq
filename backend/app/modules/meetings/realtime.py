import asyncio
import contextlib
import json
import logging
from typing import Any

import psycopg
from fastapi import WebSocket

from app.core.config import get_settings
from app.core.database import get_async_session_factory
from app.core.events import DomainEvent

logger = logging.getLogger(__name__)


class RealtimeHub:
    """Manages team-scoped WebSocket connections, Postgres LISTEN/NOTIFY fan-out, and 1s timer ticks."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()
        self.listener_active = False
        self._listener_task: asyncio.Task[None] | None = None
        self._timer_task: asyncio.Task[None] | None = None

    async def connect(self, team_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.setdefault(team_id, set()).add(websocket)

    async def disconnect(self, team_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(team_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    self._connections.pop(team_id, None)

    async def active_team_ids(self) -> list[str]:
        async with self._lock:
            return [tid for tid, conns in self._connections.items() if conns]

    async def broadcast_team(self, team_id: str, message: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._connections.get(team_id, set()))
        if not sockets:
            return
        payload = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                conns = self._connections.get(team_id)
                if conns is not None:
                    for ws in dead:
                        conns.discard(ws)

    async def handle_domain_event(self, event: DomainEvent) -> None:
        """Fallback local broadcast when Postgres LISTEN loop is inactive (e.g., unit tests)."""
        if self.listener_active:
            return
        await self.broadcast_team(
            event.team_id,
            {
                "type": "DOMAIN_EVENT",
                "event_type": event.event_type,
                "team_id": event.team_id,
                "actor_id": event.actor_id,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "occurred_at": event.occurred_at.isoformat(),
                "payload": event.payload,
            },
        )

    async def start_background_tasks(self) -> None:
        if self._listener_task is None:
            self._listener_task = asyncio.create_task(self._postgres_listen_loop())
        if self._timer_task is None:
            self._timer_task = asyncio.create_task(self._meeting_timer_loop())

    async def stop_background_tasks(self) -> None:
        for task in (self._listener_task, self._timer_task):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        self._listener_task = None
        self._timer_task = None
        self.listener_active = False

    async def _postgres_listen_loop(self) -> None:
        settings = get_settings()
        dsn = settings.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)
        while True:
            try:
                aconn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
                async with aconn:
                    await aconn.execute("LISTEN tractiq_realtime")
                    self.listener_active = True
                    async for notify in aconn.notifies():
                        try:
                            data = json.loads(notify.payload)
                            team_id = str(data.get("team_id", ""))
                            if team_id:
                                await self.broadcast_team(
                                    team_id,
                                    {
                                        "type": "DOMAIN_EVENT",
                                        "event_type": data.get("event_type"),
                                        "team_id": team_id,
                                        "actor_id": data.get("actor_id"),
                                        "entity_type": data.get("entity_type"),
                                        "entity_id": data.get("entity_id"),
                                        "occurred_at": data.get("occurred_at"),
                                        "payload": data.get("payload", {}),
                                    },
                                )
                        except Exception as exc:
                            logger.warning("Failed to dispatch NOTIFY payload: %s", exc)
            except asyncio.CancelledError:
                self.listener_active = False
                raise
            except Exception as exc:
                self.listener_active = False
                logger.warning("Postgres LISTEN loop reconnecting after error: %s", exc)
                await asyncio.sleep(1.5)

    async def _meeting_timer_loop(self) -> None:
        from app.modules.meetings.service import get_active_timer_snapshots

        session_factory = get_async_session_factory()
        while True:
            try:
                await asyncio.sleep(1.0)
                team_ids = await self.active_team_ids()
                if not team_ids:
                    continue
                async with session_factory() as session:
                    snapshots = await get_active_timer_snapshots(session, team_ids)
                for team_id, snap in snapshots.items():
                    await self.broadcast_team(
                        team_id,
                        {
                            "type": "TIMER_TICK",
                            "team_id": team_id,
                            "meeting_id": snap["meeting_id"],
                            "timer": snap["timer"],
                        },
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Meeting timer loop tick warning: %s", exc)


realtime_hub = RealtimeHub()
