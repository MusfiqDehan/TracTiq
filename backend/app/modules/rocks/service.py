from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_app_now, get_company_today, get_quarter_label
from app.core.repository import TenantRepository
from app.modules.auth.models import User
from app.modules.issues.models import Issue
from app.modules.rocks.models import Milestone, Rock
from app.modules.rocks.schemas import MilestoneRead, RockRead
from app.modules.rules_report.service import compute_rock_metrics


class RockRepository(TenantRepository[Rock]):
    model = Rock


async def list_team_rocks(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    tz_name: str,
    quarter: str | None = None,
) -> list[RockRead]:
    """Return read-only Rocks for the current quarter with computed status & milestones."""
    app_now = get_app_now()
    today: date = get_company_today(app_now, tz_name)
    target_quarter = quarter or get_quarter_label(today)

    repo = RockRepository(db, company_id)
    stmt = repo.base_select().where(Rock.team_id == team_id)
    if target_quarter != "all":
        stmt = stmt.where(Rock.quarter == target_quarter)
    stmt = stmt.order_by(Rock.id)
    rocks = (await db.execute(stmt)).scalars().all()

    if not rocks:
        return []

    rock_ids = [r.id for r in rocks]
    milestones = (
        await db.execute(
            select(Milestone)
            .where(Milestone.company_id == company_id, Milestone.rock_id.in_(rock_ids))
            .order_by(Milestone.due_date, Milestone.id)
        )
    ).scalars().all()

    users = {
        u.id: u.name
        for u in (
            await db.execute(select(User).where(User.company_id == company_id))
        )
        .scalars()
        .all()
    }

    unsolved_issues = (
        await db.execute(
            select(Issue).where(
                Issue.company_id == company_id,
                Issue.team_id == team_id,
                Issue.solved_at.is_(None),
                Issue.source_rock_id.in_(rock_ids),
            )
        )
    ).scalars().all()
    issue_by_rock = {i.source_rock_id: i.id for i in unsolved_issues if i.source_rock_id}

    ms_by_rock: dict[str, list[Milestone]] = {}
    for ms in milestones:
        ms_by_rock.setdefault(ms.rock_id, []).append(ms)

    output: list[RockRead] = []
    for r in rocks:
        rock_ms = ms_by_rock.get(r.id, [])
        metrics = compute_rock_metrics(r, rock_ms, today)
        output.append(
            RockRead(
                id=r.id,
                team_id=r.team_id,
                title=r.title,
                owner_id=r.owner_id,
                owner_name=users.get(r.owner_id, r.owner_id),
                quarter=r.quarter,
                seeded_status=r.status,
                status=metrics["status"],
                progress_percent=metrics["progress_percent"],
                unsolved_issue_id=issue_by_rock.get(r.id),
                milestones=[
                    MilestoneRead(
                        id=ms.id,
                        rock_id=ms.rock_id,
                        title=ms.title,
                        due_date=ms.due_date,
                        done=ms.done,
                        is_past_due=(not ms.done) and (ms.due_date < today),
                    )
                    for ms in rock_ms
                ],
            )
        )
    return output
