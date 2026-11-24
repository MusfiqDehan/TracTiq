from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.responses import ApiResponse, make_response
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    AuthRefreshRequest,
    AuthSwitchRequest,
    AuthTokenBundle,
    SeededUserSummary,
    UserProfile,
)
from app.modules.auth.service import (
    build_user_profile,
    issue_tokens_for_user,
    list_seeded_users,
    refresh_user_tokens,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/users", response_model=ApiResponse[list[SeededUserSummary]])
async def get_seeded_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SeededUserSummary]]:
    """List seeded users for the UI Seeded User Switcher."""
    users = await list_seeded_users(db)
    return make_response(users, request)


@router.post("/switch", response_model=ApiResponse[AuthTokenBundle])
async def switch_user(
    body: AuthSwitchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthTokenBundle]:
    """Mint JWT access and refresh tokens for a seeded user."""
    bundle = await issue_tokens_for_user(db, user_id=body.user_id, email=body.email)
    return make_response(bundle, request)


@router.post("/login", response_model=ApiResponse[AuthTokenBundle])
async def login_user(
    body: AuthSwitchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthTokenBundle]:
    """Alias for /api/auth/switch issuing JWT access and refresh tokens."""
    bundle = await issue_tokens_for_user(db, user_id=body.user_id, email=body.email)
    return make_response(bundle, request)


@router.post("/refresh", response_model=ApiResponse[AuthTokenBundle])
async def refresh_token(
    body: AuthRefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthTokenBundle]:
    """Exchange a valid refresh token for fresh JWT access and refresh tokens."""
    bundle = await refresh_user_tokens(db, body.refresh_token)
    return make_response(bundle, request)


@router.get("/me", response_model=ApiResponse[UserProfile])
async def get_me(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[UserProfile]:
    """Return the authenticated user's profile, role, and accessible teams."""
    profile = await build_user_profile(db, user)
    return make_response(profile, request)
