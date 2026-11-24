from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import dispose_engines, get_sync_session_factory
from app.core.events import event_bus
from app.core.security import create_access_token
from app.db.seed import seed_database
from app.main import app
from app.modules.meetings.realtime import realtime_hub

USER_FIXTURES = {
    "u1": ("admin", "co_1"),
    "u2": ("team_member", "co_1"),
    "u3": ("team_member", "co_1"),
    "u4": ("team_member", "co_1"),
    "u5": ("observer", "co_1"),
    "u6": ("team_member", "co_1"),
    "u7": ("observer", "co_1"),
    "u8": ("team_member", "co_1"),
    "u9": ("team_member", "co_1"),
}


def mint_jwt(user_id: str) -> str:
    role, company_id = USER_FIXTURES[user_id]
    return create_access_token(user_id=user_id, role=role, company_id=company_id)


def auth_headers(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_jwt(user_id)}"}


@pytest.fixture(autouse=True)
async def reset_seed_and_cleanup() -> AsyncGenerator[None]:
    """Ensure deterministic seed state before each test and dispose pools per loop."""
    event_bus.subscribe_realtime(realtime_hub.handle_domain_event)
    session_factory = get_sync_session_factory()
    with session_factory() as session:
        seed_database(session, reset=True)
    yield
    await dispose_engines()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
