import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_13_week_starts, get_app_now
from app.core.concurrency import decimal_to_number
from app.core.errors import AppError
from app.core.events import DomainEvent, event_bus
from app.core.repository import TenantRepository
from app.modules.auth.models import User
from app.modules.issues.models import Issue
from app.modules.rules_report.service import evaluate_measurable_score
from app.modules.scorecard.models import Measurable, Score
from app.modules.scorecard.schemas import (
    GoalRead,
    MeasurableRowRead,
    ScorecardRead,
    ScoreCellRead,
)


class MeasurableRepository(TenantRepository[Measurable]):
    model = Measurable


def _build_goal(m: Measurable) -> GoalRead:
    return GoalRead(
        type=m.goal_type,
        value=decimal_to_number(m.goal_value) if m.goal_value is not None else None,
        min=decimal_to_number(m.goal_min) if m.goal_min is not None else None,
        max=decimal_to_number(m.goal_max) if m.goal_max is not None else None,
    )


def _cell_payload(
    m: Measurable,
    week: date,
    score: Score | None,
    *,
    is_current_week: bool,
    unsolved_issue_id: str | None = None,
) -> ScoreCellRead:
    status = evaluate_measurable_score(
        m.goal_type,
        m.goal_value,
        m.goal_min,
        m.goal_max,
        score.value if score else None,
        is_current_week=is_current_week,
    )
    return ScoreCellRead(
        score_id=score.id if score else None,
        measurable_id=m.id,
        week_start=week,
        value=decimal_to_number(score.value) if score else None,
        status=status,
        version=score.version if score else None,
        updated_at=score.updated_at if score else None,
        unsolved_issue_id=unsolved_issue_id,
    )


async def get_team_scorecard(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    tz_name: str,
) -> ScorecardRead:
    """Build the 13-week Scorecard grid ending with the current week."""
    app_now = get_app_now()
    weeks = get_13_week_starts(app_now, tz_name)
    current_week = weeks[-1]
    last_closed_week = current_week - timedelta(days=7)

    meas_repo = MeasurableRepository(db, company_id)
    measurables = (
        await db.execute(
            meas_repo.base_select().where(Measurable.team_id == team_id).order_by(Measurable.id)
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

    meas_ids = [m.id for m in measurables]
    scores_map: dict[tuple[str, date], Score] = {}
    issue_map: dict[tuple[str, date], str] = {}

    if meas_ids:
        scores = (
            await db.execute(
                select(Score).where(
                    Score.company_id == company_id,
                    Score.measurable_id.in_(meas_ids),
                    Score.week_start >= weeks[0],
                    Score.week_start <= weeks[-1],
                )
            )
        ).scalars().all()
        scores_map = {(s.measurable_id, s.week_start): s for s in scores}

        unsolved = (
            await db.execute(
                select(Issue).where(
                    Issue.company_id == company_id,
                    Issue.team_id == team_id,
                    Issue.solved_at.is_(None),
                    Issue.source_measurable_id.in_(meas_ids),
                    Issue.source_week_start.is_not(None),
                )
            )
        ).scalars().all()
        for iss in unsolved:
            if iss.source_measurable_id and iss.source_week_start:
                issue_map[(iss.source_measurable_id, iss.source_week_start)] = iss.id

    rows: list[MeasurableRowRead] = []
    for m in measurables:
        cells: dict[str, ScoreCellRead] = {}
        for w in weeks:
            sc = scores_map.get((m.id, w))
            cells[w.isoformat()] = _cell_payload(
                m,
                w,
                sc,
                is_current_week=(w == current_week),
                unsolved_issue_id=issue_map.get((m.id, w)),
            )
        rows.append(
            MeasurableRowRead(
                id=m.id,
                team_id=m.team_id,
                name=m.name,
                owner_id=m.owner_id,
                owner_name=users.get(m.owner_id, m.owner_id),
                unit=m.unit,
                goal=_build_goal(m),
                cells=cells,
            )
        )

    return ScorecardRead(
        team_id=team_id,
        weeks=weeks,
        current_week=current_week,
        last_closed_week=last_closed_week,
        measurables=rows,
    )


async def upsert_score(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    tz_name: str,
    measurable_id: str,
    week_start: date,
    value: Decimal,
    expected_version: int | None,
) -> ScoreCellRead:
    """Upsert a weekly score with optional optimistic concurrency (last-save-wins if omitted)."""
    if week_start.weekday() != 0:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "week_start must be a Monday calendar date.",
            [{"field": "week_start", "message": "Date must fall on a Monday"}],
        )

    meas = (
        await db.execute(
            select(Measurable).where(
                Measurable.id == measurable_id,
                Measurable.team_id == team_id,
                Measurable.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    if meas is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "Measurable not found in this team.")

    app_now = get_app_now()
    weeks = get_13_week_starts(app_now, tz_name)
    current_week = weeks[-1]

    existing = (
        await db.execute(
            select(Score).where(
                Score.measurable_id == measurable_id,
                Score.week_start == week_start,
                Score.company_id == company_id,
            )
        )
    ).scalar_one_or_none()

    before_state = (
        {
            "value": decimal_to_number(existing.value),
            "version": existing.version,
        }
        if existing is not None
        else None
    )

    saved: Score | None = None
    if existing is not None:
        if expected_version is not None and existing.version != expected_version:
            current_cell = _cell_payload(
                meas,
                week_start,
                existing,
                is_current_week=(week_start == current_week),
            )
            raise AppError(
                409,
                "CONFLICT_STALE_VERSION",
                "Score was updated by another user. Refresh and retry.",
                {"current": current_cell.model_dump(mode="json")},
            )

        stmt = (
            update(Score)
            .where(Score.id == existing.id, Score.company_id == company_id)
        )
        if expected_version is not None:
            stmt = stmt.where(Score.version == expected_version)
        stmt = stmt.values(
            value=value,
            version=Score.version + 1,
            updated_at=app_now,
        ).returning(Score)

        saved = (await db.execute(stmt)).scalar_one_or_none()
        if saved is None:
            latest = (
                await db.execute(
                    select(Score).where(
                        Score.measurable_id == measurable_id,
                        Score.week_start == week_start,
                    )
                )
            ).scalar_one_or_none()
            current_cell = _cell_payload(
                meas, week_start, latest, is_current_week=(week_start == current_week)
            )
            raise AppError(
                409,
                "CONFLICT_STALE_VERSION",
                "Score was updated concurrently by another user.",
                {"current": current_cell.model_dump(mode="json")},
            )
    else:
        if expected_version is not None and expected_version != 0:
            raise AppError(
                409,
                "CONFLICT_STALE_VERSION",
                "Expected existing score version, but no score exists yet.",
                {"current": None},
            )
        new_id = f"sc_{measurable_id}_{week_start.isoformat()}_{uuid.uuid4().hex[:6]}"
        base_insert = pg_insert(Score).values(
            id=new_id,
            company_id=company_id,
            measurable_id=measurable_id,
            week_start=week_start,
            value=value,
            version=1,
            updated_at=app_now,
        )
        if expected_version is None:
            # Last save wins even if two users insert the very first score simultaneously.
            upsert_stmt = base_insert.on_conflict_do_update(
                constraint="uq_scores_measurable_week",
                set_={
                    "value": value,
                    "version": Score.version + 1,
                    "updated_at": app_now,
                },
            ).returning(Score)
            saved = (await db.execute(upsert_stmt)).scalar_one()
        else:
            ins_stmt = base_insert.on_conflict_do_nothing(
                constraint="uq_scores_measurable_week"
            ).returning(Score)
            saved = (await db.execute(ins_stmt)).scalar_one_or_none()
            if saved is None:
                latest = (
                    await db.execute(
                        select(Score).where(
                            Score.measurable_id == measurable_id,
                            Score.week_start == week_start,
                        )
                    )
                ).scalar_one_or_none()
                current_cell = _cell_payload(
                    meas, week_start, latest, is_current_week=(week_start == current_week)
                )
                raise AppError(
                    409,
                    "CONFLICT_STALE_VERSION",
                    "Score was created concurrently by another user.",
                    {"current": current_cell.model_dump(mode="json")},
                )

    unsolved = (
        await db.execute(
            select(Issue.id).where(
                Issue.company_id == company_id,
                Issue.team_id == team_id,
                Issue.solved_at.is_(None),
                Issue.source_measurable_id == measurable_id,
                Issue.source_week_start == week_start,
            )
        )
    ).scalar_one_or_none()

    cell = _cell_payload(
        meas,
        week_start,
        saved,
        is_current_week=(week_start == current_week),
        unsolved_issue_id=unsolved,
    )

    event = DomainEvent(
        event_type="ScoreUpdated",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="score",
        entity_id=saved.id,
        occurred_at=app_now,
        before_state=before_state,
        after_state={
            "measurable_id": measurable_id,
            "week_start": week_start.isoformat(),
            "value": decimal_to_number(saved.value),
            "version": saved.version,
            "status": cell.status,
        },
        payload={"cell": cell.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return cell
