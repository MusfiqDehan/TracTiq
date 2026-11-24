from dataclasses import dataclass

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import decode_token
from app.modules.auth.models import User
from app.modules.companies.models import Company
from app.modules.teams.models import Membership, Team


@dataclass(slots=True)
class TeamContext:
    user: User
    team: Team
    company: Company


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve authenticated user from Bearer JWT (or X-User-Id only when AUTH_DEV_BYPASS=true)."""
    settings = get_settings()
    user_id: str | None = None

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if not token:
            raise AppError(401, "UNAUTHORIZED", "Missing bearer token.")
        payload = decode_token(token, expected_type="access")
        user_id = str(payload["sub"])
    elif settings.AUTH_DEV_BYPASS and x_user_id:
        user_id = x_user_id.strip()
    elif request.cookies.get("tractiq_access_token"):
        payload = decode_token(
            request.cookies["tractiq_access_token"], expected_type="access"
        )
        user_id = str(payload["sub"])

    if not user_id:
        raise AppError(401, "UNAUTHORIZED", "Authentication credentials were not provided.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppError(401, "UNAUTHORIZED", "Authenticated user does not exist.")
    return user


async def get_authorized_team(
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamContext:
    """Verify team belongs to user's company and user has access (Admin or Member/Observer).

    Returns 404 TEAM_NOT_FOUND when the team does not exist OR the caller is not a member,
    preventing cross-team existence enumeration via guessed IDs.
    """
    team_res = await db.execute(
        select(Team).where(Team.id == team_id, Team.company_id == user.company_id)
    )
    team = team_res.scalar_one_or_none()
    if team is None:
        raise AppError(404, "TEAM_NOT_FOUND", "Team not found.")

    if user.role != "admin":
        mem_res = await db.execute(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.team_id == team.id,
                Membership.company_id == user.company_id,
            )
        )
        if mem_res.scalar_one_or_none() is None:
            raise AppError(404, "TEAM_NOT_FOUND", "Team not found.")

    comp_res = await db.execute(select(Company).where(Company.id == user.company_id))
    company = comp_res.scalar_one()
    return TeamContext(user=user, team=team, company=company)


async def require_team_writer(
    ctx: TeamContext = Depends(get_authorized_team),
) -> TeamContext:
    """Enforce that the caller has write privileges on the authorized team (not an Observer)."""
    if ctx.user.role == "observer":
        raise AppError(
            403,
            "OBSERVER_READ_ONLY",
            "Observers have read-only access and cannot perform mutations.",
        )
    return ctx


async def validate_owner_eligible(
    db: AsyncSession,
    team_id: str,
    company_id: str,
    owner_id: str,
) -> User:
    """Validate that an assigned owner belongs to the team (or is Admin) and is not an Observer."""
    user_res = await db.execute(
        select(User).where(User.id == owner_id, User.company_id == company_id)
    )
    owner = user_res.scalar_one_or_none()
    if owner is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Selected owner does not exist in this company.",
            [{"field": "owner_id", "message": "Invalid owner_id"}],
        )
    if owner.role == "observer":
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Observers cannot be assigned ownership.",
            [{"field": "owner_id", "message": "Observer cannot own items"}],
        )
    if owner.role != "admin":
        mem_res = await db.execute(
            select(Membership).where(
                Membership.user_id == owner.id,
                Membership.team_id == team_id,
                Membership.company_id == company_id,
            )
        )
        if mem_res.scalar_one_or_none() is None:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "Selected owner is not a member of this team.",
                [{"field": "owner_id", "message": "User is not a team member"}],
            )
    return owner
