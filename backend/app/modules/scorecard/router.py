from datetime import date

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import parse_expected_version
from app.core.database import get_db
from app.core.deps import TeamContext, get_authorized_team, require_team_writer
from app.core.responses import ApiResponse, make_response
from app.modules.scorecard.schemas import ScorecardRead, ScoreCellRead, ScoreUpsertRequest
from app.modules.scorecard.service import get_team_scorecard, upsert_score

router = APIRouter(prefix="/api/teams/{team_id}", tags=["scorecard"])


@router.get("/scorecard", response_model=ApiResponse[ScorecardRead])
async def read_scorecard(
    request: Request,
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ScorecardRead]:
    """Return the team's 13-week Scorecard matrix with computed cell statuses."""
    scorecard = await get_team_scorecard(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    return make_response(scorecard, request)


@router.put(
    "/measurables/{measurable_id}/scores/{week_start}",
    response_model=ApiResponse[ScoreCellRead],
)
async def put_score(
    measurable_id: str,
    week_start: date,
    body: ScoreUpsertRequest,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ScoreCellRead]:
    """Create or update a weekly score inline (supports optional If-Match optimistic concurrency)."""
    expected_version = parse_expected_version(if_match, body.expected_version)
    cell = await upsert_score(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        tz_name=ctx.company.timezone,
        measurable_id=measurable_id,
        week_start=week_start,
        value=body.value,
        expected_version=expected_version,
    )
    if cell.version is not None:
        response.headers["ETag"] = f'W/"{cell.version}"'
    return make_response(cell, request)
