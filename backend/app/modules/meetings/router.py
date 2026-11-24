from fastapi import (
    APIRouter,
    Depends,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_async_session_factory, get_db
from app.core.deps import (
    TeamContext,
    get_authorized_team,
    get_current_user,
    require_team_writer,
)
from app.core.responses import ApiResponse, make_response
from app.core.security import decode_token
from app.modules.auth.models import User
from app.modules.companies.models import Company
from app.modules.meetings.realtime import realtime_hub
from app.modules.meetings.schemas import (
    MeetingActiveRead,
    MeetingListItemRead,
    MeetingRateRequest,
    MeetingSummaryRead,
)
from app.modules.meetings.service import (
    advance_meeting,
    end_meeting,
    get_active_meeting,
    get_meeting_summary,
    join_meeting,
    list_ended_meetings,
    rate_meeting,
    start_meeting,
)
from app.modules.teams.models import Membership, Team

router = APIRouter(tags=["meetings"])


@router.post(
    "/api/teams/{team_id}/meetings/start",
    response_model=ApiResponse[MeetingActiveRead],
    status_code=201,
)
async def post_start_meeting(
    request: Request,
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingActiveRead]:
    """Start a new Level 10 Meeting for the team (caller becomes facilitator)."""
    meeting = await start_meeting(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        tz_name=ctx.company.timezone,
    )
    return make_response(meeting, request)


@router.get(
    "/api/teams/{team_id}/meetings/active",
    response_model=ApiResponse[MeetingActiveRead | None],
)
async def get_team_active_meeting(
    request: Request,
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingActiveRead | None]:
    """Fetch the active Level 10 Meeting state for a team, or null if none."""
    active = await get_active_meeting(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    return make_response(active, request)


@router.get(
    "/api/teams/{team_id}/meetings",
    response_model=ApiResponse[list[MeetingListItemRead]],
)
async def get_team_ended_meetings(
    request: Request,
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[MeetingListItemRead]]:
    """List ended meetings for the team (including seeded mt1 and mt2)."""
    items = await list_ended_meetings(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    return make_response(items, request)


@router.post(
    "/api/meetings/{meeting_id}/join",
    response_model=ApiResponse[MeetingActiveRead],
)
async def post_join_meeting(
    meeting_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingActiveRead]:
    """Join an active meeting as an Admin, Team Member, or Observer."""
    _, active_read = await join_meeting(db, meeting_id=meeting_id, user=user)
    return make_response(active_read, request)


@router.post(
    "/api/meetings/{meeting_id}/advance",
    response_model=ApiResponse[MeetingActiveRead],
)
async def post_advance_meeting(
    meeting_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingActiveRead]:
    """Facilitator-only endpoint to advance to the next agenda section."""
    active = await advance_meeting(db, meeting_id=meeting_id, user=user)
    return make_response(active, request)


@router.post(
    "/api/meetings/{meeting_id}/rate",
    response_model=ApiResponse[MeetingActiveRead],
)
async def post_rate_meeting(
    meeting_id: str,
    body: MeetingRateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingActiveRead]:
    """Submit or update a 1-10 meeting rating (Admins & Team Members only)."""
    active = await rate_meeting(
        db, meeting_id=meeting_id, user=user, rating=body.rating
    )
    return make_response(active, request)


@router.post(
    "/api/meetings/{meeting_id}/end",
    response_model=ApiResponse[MeetingSummaryRead],
)
async def post_end_meeting(
    meeting_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingSummaryRead]:
    """Facilitator-only endpoint to conclude the meeting and freeze summary snapshot."""
    summary = await end_meeting(db, meeting_id=meeting_id, user=user)
    return make_response(summary, request)


@router.get(
    "/api/meetings/{meeting_id}/summary",
    response_model=ApiResponse[MeetingSummaryRead],
)
async def get_ended_meeting_summary(
    meeting_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MeetingSummaryRead]:
    """Return summary of any ended meeting (including seeded mt1 and mt2)."""
    summary = await get_meeting_summary(db, meeting_id=meeting_id, user=user)
    return make_response(summary, request)


@router.websocket("/api/ws/teams/{team_id}")
async def team_realtime_ws(
    websocket: WebSocket,
    team_id: str,
    token: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
) -> None:
    """Real-time WebSocket stream delivering snapshots, 1s timer ticks, and domain mutations."""
    settings = get_settings()
    resolved_user_id: str | None = None

    if token:
        try:
            payload = decode_token(token, expected_type="access")
            resolved_user_id = str(payload["sub"])
        except Exception:
            await websocket.close(code=4401)
            return
    elif settings.AUTH_DEV_BYPASS and user_id:
        resolved_user_id = user_id
    elif websocket.cookies.get("tractiq_access_token"):
        try:
            payload = decode_token(
                websocket.cookies["tractiq_access_token"], expected_type="access"
            )
            resolved_user_id = str(payload["sub"])
        except Exception:
            await websocket.close(code=4401)
            return

    if not resolved_user_id:
        await websocket.close(code=4401)
        return

    session_factory = get_async_session_factory()
    async with session_factory() as db:
        user = (
            await db.execute(select(User).where(User.id == resolved_user_id))
        ).scalar_one_or_none()
        if user is None:
            await websocket.close(code=4401)
            return

        team = (
            await db.execute(
                select(Team).where(Team.id == team_id, Team.company_id == user.company_id)
            )
        ).scalar_one_or_none()
        if team is None:
            await websocket.close(code=4404)
            return

        if user.role != "admin":
            mem = (
                await db.execute(
                    select(Membership).where(
                        Membership.user_id == user.id,
                        Membership.team_id == team.id,
                        Membership.company_id == user.company_id,
                    )
                )
            ).scalar_one_or_none()
            if mem is None:
                await websocket.close(code=4404)
                return

        company = (
            await db.execute(select(Company).where(Company.id == user.company_id))
        ).scalar_one()

        await websocket.accept()

        # Auto-join active meeting, send SNAPSHOT first, then register for future broadcasts
        active = await get_active_meeting(
            db,
            company_id=company.id,
            team_id=team_id,
            tz_name=company.timezone,
        )
        if active is not None:
            _, active = await join_meeting(db, meeting_id=active.id, user=user)

    try:
        await websocket.send_json(
            {
                "type": "MEETING_SNAPSHOT",
                "team_id": team_id,
                "meeting": active.model_dump(mode="json") if active else None,
            }
        )
        await realtime_hub.connect(team_id, websocket)
        while True:
            raw_msg = await websocket.receive_text()
            if raw_msg == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await realtime_hub.disconnect(team_id, websocket)
    except Exception:
        await realtime_hub.disconnect(team_id, websocket)
