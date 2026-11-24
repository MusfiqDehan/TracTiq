from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TeamContext, get_authorized_team
from app.core.responses import ApiResponse, make_response
from app.modules.rocks.schemas import RockRead
from app.modules.rocks.service import list_team_rocks

router = APIRouter(prefix="/api/teams/{team_id}/rocks", tags=["rocks"])


@router.get("", response_model=ApiResponse[list[RockRead]])
async def get_team_rocks(
    request: Request,
    quarter: str | None = Query(default=None),
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[RockRead]]:
    """Return read-only Rocks for the current quarter with computed status & milestones."""
    rocks = await list_team_rocks(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
        quarter=quarter,
    )
    return make_response(rocks, request)
