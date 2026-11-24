from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_app_now, get_company_today
from app.core.deps import TeamContext
from app.modules.auth.models import User
from app.modules.auth.schemas import TeamSummary
from app.modules.issues.service import list_team_issues
from app.modules.meetings.service import get_active_meeting, list_ended_meetings
from app.modules.rocks.service import list_team_rocks
from app.modules.scorecard.service import get_team_scorecard
from app.modules.teams.models import Membership, Team
from app.modules.teams.schemas import (
    EligibleOwnerRead,
    TeamDetailRead,
    TeamOverviewRead,
)
from app.modules.todos.service import list_team_todos


async def list_accessible_teams(db: AsyncSession, user: User) -> list[TeamSummary]:
    if user.role == "admin":
        stmt = (
            select(Team).where(Team.company_id == user.company_id).order_by(Team.id)
        )
    else:
        stmt = (
            select(Team)
            .join(Membership, Membership.team_id == Team.id)
            .where(Team.company_id == user.company_id, Membership.user_id == user.id)
            .order_by(Team.id)
        )
    rows = (await db.execute(stmt)).scalars().all()
    return [TeamSummary(id=t.id, name=t.name, company_id=t.company_id) for t in rows]


async def get_eligible_owners(
    db: AsyncSession, *, company_id: str, team_id: str
) -> list[EligibleOwnerRead]:
    """Return Admins and Team Members eligible to own items in this team (never Observers)."""
    team_member_ids = select(Membership.user_id).where(
        Membership.company_id == company_id,
        Membership.team_id == team_id,
    )
    users = (
        await db.execute(
            select(User)
            .where(
                User.company_id == company_id,
                User.role != "observer",
                or_(User.role == "admin", User.id.in_(team_member_ids)),
            )
            .order_by(User.id)
        )
    ).scalars().all()
    return [
        EligibleOwnerRead(id=u.id, name=u.name, email=u.email, role=u.role)
        for u in users
    ]


async def get_team_detail(db: AsyncSession, ctx: TeamContext) -> TeamDetailRead:
    app_now = get_app_now()
    today = get_company_today(app_now, ctx.company.timezone)
    owners = await get_eligible_owners(
        db, company_id=ctx.company.id, team_id=ctx.team.id
    )
    active_meeting = await get_active_meeting(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    return TeamDetailRead(
        id=ctx.team.id,
        name=ctx.team.name,
        company_id=ctx.company.id,
        company_name=ctx.company.name,
        company_timezone=ctx.company.timezone,
        current_user_role=ctx.user.role,
        can_write=(ctx.user.role != "observer"),
        today=today,
        eligible_owners=owners,
        active_meeting=active_meeting,
    )


async def get_team_overview(db: AsyncSession, ctx: TeamContext) -> TeamOverviewRead:
    team_detail = await get_team_detail(db, ctx)
    scorecard = await get_team_scorecard(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    unsolved_issues, _, _ = await list_team_issues(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        status_filter="unsolved",
    )
    todos, _, _ = await list_team_todos(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
        status_filter="all",
    )
    rocks = await list_team_rocks(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    ended_meetings = await list_ended_meetings(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
    )
    return TeamOverviewRead(
        team=team_detail,
        scorecard=scorecard,
        unsolved_issues=unsolved_issues,
        todos=todos,
        rocks=rocks,
        ended_meetings=ended_meetings,
    )
