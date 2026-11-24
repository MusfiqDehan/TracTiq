from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TeamContext, get_authorized_team, get_current_user
from app.core.responses import ApiResponse, make_response
from app.modules.auth.models import User
from app.modules.auth.schemas import TeamSummary
from app.modules.teams.schemas import TeamDetailRead, TeamOverviewRead
from app.modules.teams.service import (
    get_team_detail,
    get_team_overview,
    list_accessible_teams,
)

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("", response_model=ApiResponse[list[TeamSummary]])
async def get_teams(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[TeamSummary]]:
    """List teams accessible to the authenticated user."""
    teams = await list_accessible_teams(db, user)
    return make_response(teams, request)


@router.get("/{team_id}", response_model=ApiResponse[TeamDetailRead])
async def get_team(
    request: Request,
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TeamDetailRead]:
    """Return authorized team metadata, eligible non-observer owners, and active meeting."""
    detail = await get_team_detail(db, ctx)
    return make_response(detail, request)


@router.get("/{team_id}/overview", response_model=ApiResponse[TeamOverviewRead])
async def get_overview(
    request: Request,
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TeamOverviewRead]:
    """Consolidated Team Page state (Scorecard, Unsolved Issues, To-Dos, Rocks, Meetings)."""
    overview = await get_team_overview(db, ctx)
    return make_response(overview, request)
