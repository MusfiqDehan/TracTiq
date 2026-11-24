from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    AuthTokenBundle,
    SeededUserSummary,
    TeamSummary,
    UserProfile,
)
from app.modules.companies.models import Company
from app.modules.teams.models import Membership, Team


async def list_seeded_users(db: AsyncSession) -> list[SeededUserSummary]:
    """List all users along with accessible team IDs for the seeded user switcher."""
    users = (await db.execute(select(User).order_by(User.id))).scalars().all()
    teams = (await db.execute(select(Team).order_by(Team.id))).scalars().all()
    memberships = (await db.execute(select(Membership))).scalars().all()

    teams_by_company: dict[str, list[str]] = {}
    for t in teams:
        teams_by_company.setdefault(t.company_id, []).append(t.id)

    member_map: dict[str, list[str]] = {}
    for m in memberships:
        member_map.setdefault(m.user_id, []).append(m.team_id)

    result: list[SeededUserSummary] = []
    for u in users:
        team_ids = (
            list(teams_by_company.get(u.company_id, []))
            if u.role == "admin"
            else sorted(member_map.get(u.id, []))
        )
        result.append(
            SeededUserSummary(
                id=u.id,
                name=u.name,
                email=u.email,
                role=u.role,
                company_id=u.company_id,
                team_ids=team_ids,
            )
        )
    return result


async def build_user_profile(db: AsyncSession, user: User) -> UserProfile:
    """Build UserProfile containing accessible teams based on role and memberships."""
    company = (
        await db.execute(select(Company).where(Company.id == user.company_id))
    ).scalar_one()

    if user.role == "admin":
        teams_stmt = (
            select(Team)
            .where(Team.company_id == user.company_id)
            .order_by(Team.id)
        )
    else:
        teams_stmt = (
            select(Team)
            .join(Membership, Membership.team_id == Team.id)
            .where(
                Team.company_id == user.company_id,
                Membership.user_id == user.id,
            )
            .order_by(Team.id)
        )
    teams = (await db.execute(teams_stmt)).scalars().all()

    return UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        company_id=user.company_id,
        company_name=company.name,
        company_timezone=company.timezone,
        teams=[
            TeamSummary(id=t.id, name=t.name, company_id=t.company_id) for t in teams
        ],
    )


async def issue_tokens_for_user(
    db: AsyncSession, *, user_id: str | None = None, email: str | None = None
) -> AuthTokenBundle:
    """Authenticate a seeded user by user_id or email and issue JWT access + refresh tokens."""
    if not user_id and not email:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Either user_id or email must be provided.",
            [{"field": "user_id", "message": "Provide user_id or email"}],
        )

    stmt = select(User).where(User.id == user_id) if user_id else select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if user is None:
        raise AppError(401, "UNAUTHORIZED", "User credentials not found.")

    settings = get_settings()
    access_token = create_access_token(user.id, user.role, user.company_id)
    refresh_token = create_refresh_token(user.id, user.role, user.company_id)
    profile = await build_user_profile(db, user)

    return AuthTokenBundle(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=profile,
    )


async def refresh_user_tokens(db: AsyncSession, refresh_token: str) -> AuthTokenBundle:
    """Validate a refresh token and mint a fresh access + refresh token pair."""
    payload = decode_token(refresh_token, expected_type="refresh")
    user_id = str(payload["sub"])
    return await issue_tokens_for_user(db, user_id=user_id)
