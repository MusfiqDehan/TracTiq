from fastapi import APIRouter, Request

from app.core.database import get_sync_session_factory
from app.core.responses import ApiResponse, make_response
from app.db.seed import seed_database

router = APIRouter(prefix="/api/test", tags=["test"])


@router.post("/reset", response_model=ApiResponse[dict[str, str]])
async def reset_test_database(request: Request) -> ApiResponse[dict[str, str]]:
    """Test-only database reset restoring exact seed.json state (APP_ENV=test only)."""
    session_factory = get_sync_session_factory()
    with session_factory() as session:
        seed_database(session, reset=True)
    return make_response({"status": "reset"}, request)
