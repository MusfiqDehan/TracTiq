import time
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import and_, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_app_now, get_week_start, to_company_tz
from app.core.concurrency import decimal_to_number
from app.core.errors import AppError
from app.core.events import DomainEvent, event_bus
from app.core.repository import TenantRepository
from app.modules.auth.models import User
from app.modules.companies.models import Company
from app.modules.issues.models import Issue
from app.modules.meetings.agenda import (
    MEETING_AGENDA_CONFIG,
    NEXT_SECTION_MAP,
    SECTION_BY_KEY,
)
from app.modules.meetings.models import Meeting, MeetingAttendee, MeetingRating
from app.modules.meetings.schemas import (
    MeetingActiveRead,
    MeetingAttendeeRead,
    MeetingListItemRead,
    MeetingRatingRead,
    MeetingSectionTimerRead,
    MeetingSummaryIssueItem,
    MeetingSummaryMeasurableItem,
    MeetingSummaryRead,
    MeetingSummaryTodoItem,
)
from app.modules.rules_report.service import (
    evaluate_measurable_score,
    round_half_up_1dec,
)
from app.modules.scorecard.models import Measurable, Score
from app.modules.todos.models import Todo


def get_timer_clock_ms() -> int:
    """Epoch milliseconds used exclusively to compute live section elapsed seconds."""
    return int(time.time() * 1000)


def compute_section_timer(meeting: Meeting) -> MeetingSectionTimerRead:
    section_cfg = SECTION_BY_KEY.get(meeting.current_section)
    allocated = section_cfg["duration_seconds"] if section_cfg else 0
    label = section_cfg["label"] if section_cfg else meeting.current_section.title()

    if meeting.status == "active" and meeting.section_started_monotonic_ms is not None:
        elapsed = max(0, (get_timer_clock_ms() - meeting.section_started_monotonic_ms) // 1000)
    else:
        elapsed = 0

    remaining = max(0, allocated - elapsed)
    is_overtime = meeting.status == "active" and elapsed > allocated
    overtime = max(0, elapsed - allocated)

    return MeetingSectionTimerRead(
        current_section=meeting.current_section,
        section_label=label,
        allocated_seconds=allocated,
        elapsed_seconds=elapsed,
        remaining_seconds=remaining,
        is_overtime=is_overtime,
        overtime_seconds=overtime,
    )


class MeetingRepository(TenantRepository[Meeting]):
    model = Meeting


async def _load_users_map(db: AsyncSession, company_id: str) -> dict[str, User]:
    rows = (
        await db.execute(select(User).where(User.company_id == company_id))
    ).scalars().all()
    return {u.id: u for u in rows}


async def serialize_active_meeting(
    db: AsyncSession, meeting: Meeting, tz_name: str
) -> MeetingActiveRead:
    users = await _load_users_map(db, meeting.company_id)
    attendees_rows = (
        await db.execute(
            select(MeetingAttendee)
            .where(MeetingAttendee.meeting_id == meeting.id)
            .order_by(MeetingAttendee.user_id)
        )
    ).scalars().all()
    ratings_rows = (
        await db.execute(
            select(MeetingRating)
            .where(MeetingRating.meeting_id == meeting.id)
            .order_by(MeetingRating.user_id)
        )
    ).scalars().all()

    issues_solved_rows = (
        await db.execute(
            select(Issue.id)
            .where(
                Issue.company_id == meeting.company_id,
                Issue.team_id == meeting.team_id,
                or_(
                    Issue.solved_in_meeting_id == meeting.id,
                    and_(
                        Issue.solved_in_meeting_id.is_(None),
                        Issue.solved_at.is_not(None),
                        Issue.solved_at >= meeting.started_at,
                    ),
                ),
            )
            .order_by(Issue.id)
        )
    ).scalars().all()

    todos_created_rows = (
        await db.execute(
            select(Todo.id)
            .where(
                Todo.company_id == meeting.company_id,
                Todo.team_id == meeting.team_id,
                or_(
                    Todo.created_in_meeting_id == meeting.id,
                    and_(
                        Todo.created_in_meeting_id.is_(None),
                        Todo.created_at >= meeting.started_at,
                    ),
                ),
            )
            .order_by(Todo.id)
        )
    ).scalars().all()

    attendees: list[MeetingAttendeeRead] = []
    for att in attendees_rows:
        u = users.get(att.user_id)
        if u is not None:
            attendees.append(
                MeetingAttendeeRead(
                    user_id=u.id, name=u.name, role=u.role, joined_at=att.joined_at
                )
            )

    ratings: list[MeetingRatingRead] = []
    rating_values: list[int] = []
    for rt in ratings_rows:
        u = users.get(rt.user_id)
        if u is not None and u.role != "observer":
            rating_values.append(rt.rating)
            ratings.append(
                MeetingRatingRead(
                    user_id=u.id, name=u.name, rating=rt.rating, updated_at=rt.updated_at
                )
            )

    avg_rating = (
        round_half_up_1dec(sum(rating_values), len(rating_values))
        if rating_values
        else None
    )
    started_local = to_company_tz(meeting.started_at, tz_name).date()
    scorecard_week = get_week_start(started_local) - timedelta(days=7)
    facilitator = users.get(meeting.facilitator_id)

    return MeetingActiveRead(
        id=meeting.id,
        team_id=meeting.team_id,
        facilitator_id=meeting.facilitator_id,
        facilitator_name=facilitator.name if facilitator else meeting.facilitator_id,
        status=meeting.status,
        current_section=meeting.current_section,
        scorecard_week=scorecard_week,
        started_at=meeting.started_at,
        section_started_at=meeting.section_started_at,
        timer=compute_section_timer(meeting),
        attendees=attendees,
        ratings=ratings,
        average_rating=avg_rating,
        issues_solved_ids=list(issues_solved_rows),
        todos_created_ids=list(todos_created_rows),
        agenda=list(MEETING_AGENDA_CONFIG),
    )


async def get_active_timer_snapshots(
    db: AsyncSession, team_ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Compute live timer payloads for all currently active meetings in requested teams."""
    rows = (
        await db.execute(
            select(Meeting).where(
                Meeting.team_id.in_(team_ids),
                Meeting.status == "active",
            )
        )
    ).scalars().all()
    return {
        m.team_id: {
            "meeting_id": m.id,
            "timer": compute_section_timer(m).model_dump(mode="json"),
        }
        for m in rows
    }


async def get_active_meeting(
    db: AsyncSession, *, company_id: str, team_id: str, tz_name: str
) -> MeetingActiveRead | None:
    meeting = (
        await db.execute(
            select(Meeting).where(
                Meeting.company_id == company_id,
                Meeting.team_id == team_id,
                Meeting.status == "active",
            )
        )
    ).scalar_one_or_none()
    if meeting is None:
        return None
    return await serialize_active_meeting(db, meeting, tz_name)


async def list_ended_meetings(
    db: AsyncSession, *, company_id: str, team_id: str, tz_name: str
) -> list[MeetingListItemRead]:
    """List ended meetings for a team (including seeded mt1 and mt2)."""
    meetings = (
        await db.execute(
            select(Meeting)
            .where(
                Meeting.company_id == company_id,
                Meeting.team_id == team_id,
                Meeting.status == "ended",
            )
            .order_by(Meeting.started_at.desc(), Meeting.id.desc())
        )
    ).scalars().all()
    if not meetings:
        return []
    users = await _load_users_map(db, company_id)
    ratings_all = (
        await db.execute(
            select(MeetingRating).where(
                MeetingRating.company_id == company_id,
                MeetingRating.meeting_id.in_([m.id for m in meetings]),
            )
        )
    ).scalars().all()
    ratings_by_mt: dict[str, list[int]] = {}
    for rt in ratings_all:
        u = users.get(rt.user_id)
        if u is not None and u.role != "observer":
            ratings_by_mt.setdefault(rt.meeting_id, []).append(rt.rating)

    items: list[MeetingListItemRead] = []
    for m in meetings:
        if m.summary_snapshot and "rating" in m.summary_snapshot:
            avg_rating = m.summary_snapshot["rating"]
        else:
            r_vals = ratings_by_mt.get(m.id, [])
            avg_rating = (
                round_half_up_1dec(sum(r_vals), len(r_vals)) if r_vals else None
            )
        fac = users.get(m.facilitator_id)
        items.append(
            MeetingListItemRead(
                id=m.id,
                team_id=m.team_id,
                facilitator_id=m.facilitator_id,
                facilitator_name=fac.name if fac else m.facilitator_id,
                status=m.status,
                started_at=m.started_at,
                ended_at=m.ended_at,
                rating=avg_rating,
            )
        )
    return items


async def start_meeting(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    tz_name: str,
) -> MeetingActiveRead:
    """Start a Level 10 Meeting for the team (one active meeting per team enforced in DB)."""
    app_now = get_app_now()
    mono_ms = get_timer_clock_ms()
    first_section = MEETING_AGENDA_CONFIG[0]["key"]

    meeting = Meeting(
        id=f"mt_{uuid.uuid4().hex[:12]}",
        company_id=company_id,
        team_id=team_id,
        facilitator_id=actor_id,
        status="active",
        current_section=first_section,
        section_started_at=app_now,
        section_started_monotonic_ms=mono_ms,
        started_at=app_now,
        ended_at=None,
        summary_snapshot=None,
    )
    db.add(meeting)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError(
            409,
            "CONFLICT_ACTIVE_MEETING",
            "An active Level 10 meeting is already running for this team.",
        ) from exc

    db.add(
        MeetingAttendee(
            company_id=company_id,
            meeting_id=meeting.id,
            user_id=actor_id,
            joined_at=app_now,
        )
    )
    await db.flush()

    active_read = await serialize_active_meeting(db, meeting, tz_name)
    event = DomainEvent(
        event_type="MeetingStarted",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="meeting",
        entity_id=meeting.id,
        occurred_at=app_now,
        before_state=None,
        after_state={"status": "active", "current_section": first_section},
        payload={"meeting": active_read.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return active_read


async def join_meeting(
    db: AsyncSession,
    *,
    meeting_id: str,
    user: User,
) -> tuple[Meeting, MeetingActiveRead]:
    """Add any authorized team reader (Admin, Member, or Observer) to meeting attendees."""
    meeting = await _get_authorized_meeting(db, meeting_id, user)
    if meeting.status != "active":
        raise AppError(409, "MEETING_ENDED", "Cannot join an ended meeting.")

    company = (
        await db.execute(select(Company).where(Company.id == user.company_id))
    ).scalar_one()
    app_now = get_app_now()

    stmt = (
        pg_insert(MeetingAttendee)
        .values(
            company_id=meeting.company_id,
            meeting_id=meeting.id,
            user_id=user.id,
            joined_at=app_now,
        )
        .on_conflict_do_nothing(index_elements=["meeting_id", "user_id"])
        .returning(MeetingAttendee.user_id)
    )
    inserted_uid = (await db.execute(stmt)).scalar_one_or_none()
    active_read = await serialize_active_meeting(db, meeting, company.timezone)

    if inserted_uid is not None:
        event = DomainEvent(
            event_type="MeetingAttendeeJoined",
            company_id=meeting.company_id,
            team_id=meeting.team_id,
            actor_id=user.id,
            entity_type="meeting",
            entity_id=meeting.id,
            occurred_at=app_now,
            payload={"meeting": active_read.model_dump(mode="json")},
            skip_audit=True,
        )
        await event_bus.stage_in_tx(db, event)
        await db.commit()
        await event_bus.publish_committed(event)
    else:
        await db.commit()

    return meeting, active_read


async def advance_meeting(
    db: AsyncSession, *, meeting_id: str, user: User
) -> MeetingActiveRead:
    """Facilitator-only agenda advancement (scorecard -> ids -> conclude)."""
    if user.role == "observer":
        raise AppError(
            403,
            "OBSERVER_READ_ONLY",
            "Observers cannot facilitate or advance meetings.",
        )

    meeting = await _get_authorized_meeting(db, meeting_id, user)
    if meeting.status != "active":
        raise AppError(409, "MEETING_ENDED", "Meeting has already ended.")
    if meeting.facilitator_id != user.id:
        raise AppError(
            403,
            "NOT_FACILITATOR",
            "Only the meeting facilitator can advance the agenda.",
        )

    next_section = NEXT_SECTION_MAP.get(meeting.current_section)
    if next_section is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Meeting is already in the final Conclude section; call end to finish.",
        )

    company = (
        await db.execute(select(Company).where(Company.id == user.company_id))
    ).scalar_one()
    app_now = get_app_now()
    mono_ms = get_timer_clock_ms()
    prev_section = meeting.current_section

    saved = (
        await db.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id, Meeting.status == "active")
            .values(
                current_section=next_section,
                section_started_at=app_now,
                section_started_monotonic_ms=mono_ms,
            )
            .returning(Meeting)
        )
    ).scalar_one()

    active_read = await serialize_active_meeting(db, saved, company.timezone)
    event = DomainEvent(
        event_type="MeetingSectionAdvanced",
        company_id=saved.company_id,
        team_id=saved.team_id,
        actor_id=user.id,
        entity_type="meeting",
        entity_id=saved.id,
        occurred_at=app_now,
        before_state={"current_section": prev_section},
        after_state={"current_section": next_section},
        payload={"meeting": active_read.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return active_read


async def rate_meeting(
    db: AsyncSession, *, meeting_id: str, user: User, rating: int
) -> MeetingActiveRead:
    """Attending Admin or Team Member submits or updates a 1-10 meeting rating."""
    if user.role == "observer":
        raise AppError(
            403,
            "OBSERVER_READ_ONLY",
            "Observers cannot submit meeting ratings.",
        )

    meeting = await _get_authorized_meeting(db, meeting_id, user)
    if meeting.status != "active":
        raise AppError(409, "MEETING_ENDED", "Cannot rate an ended meeting.")
    if meeting.current_section != "conclude":
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Meeting ratings can only be submitted during the Conclude section.",
        )

    company = (
        await db.execute(select(Company).where(Company.id == user.company_id))
    ).scalar_one()
    app_now = get_app_now()

    await db.execute(
        pg_insert(MeetingAttendee)
        .values(
            company_id=meeting.company_id,
            meeting_id=meeting.id,
            user_id=user.id,
            joined_at=app_now,
        )
        .on_conflict_do_nothing(index_elements=["meeting_id", "user_id"])
    )

    await db.execute(
        pg_insert(MeetingRating)
        .values(
            company_id=meeting.company_id,
            meeting_id=meeting.id,
            user_id=user.id,
            rating=rating,
            updated_at=app_now,
        )
        .on_conflict_do_update(
            index_elements=["meeting_id", "user_id"],
            set_={"rating": rating, "updated_at": app_now},
        )
    )

    active_read = await serialize_active_meeting(db, meeting, company.timezone)
    event = DomainEvent(
        event_type="MeetingRated",
        company_id=meeting.company_id,
        team_id=meeting.team_id,
        actor_id=user.id,
        entity_type="meeting",
        entity_id=meeting.id,
        occurred_at=app_now,
        after_state={"rating": rating},
        payload={"meeting": active_read.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return active_read


async def _build_summary_details(
    db: AsyncSession, meeting: Meeting, company: Company
) -> MeetingSummaryRead:
    tz_name = company.timezone
    users = await _load_users_map(db, meeting.company_id)
    app_now = get_app_now()

    if meeting.summary_snapshot is not None and "_detail" in meeting.summary_snapshot:
        snap = meeting.summary_snapshot
        det = snap["_detail"]
        return MeetingSummaryRead(
            meeting_id=meeting.id,
            team_id=meeting.team_id,
            facilitator_id=meeting.facilitator_id,
            facilitator_name=det["facilitator_name"],
            started_at=meeting.started_at,
            ended_at=meeting.ended_at or app_now,
            scorecard_week=date.fromisoformat(snap["scorecard_week"]),
            measurable_status=snap["measurable_status"],
            issues_solved=snap["issues_solved"],
            todos_created=snap["todos_created"],
            attendee_ids=snap["attendee_ids"],
            rating=snap["rating"],
            measurables_detail=[
                MeetingSummaryMeasurableItem(**m) for m in det["measurables_detail"]
            ],
            issues_solved_detail=[
                MeetingSummaryIssueItem(**i) for i in det["issues_solved_detail"]
            ],
            todos_created_detail=[
                MeetingSummaryTodoItem(**t) for t in det["todos_created_detail"]
            ],
            attendees_detail=[
                MeetingAttendeeRead(**a) for a in det["attendees_detail"]
            ],
        )

    assert meeting.ended_at is not None
    started_local = to_company_tz(meeting.started_at, tz_name).date()
    scorecard_week = get_week_start(started_local) - timedelta(days=7)

    measurables = (
        await db.execute(
            select(Measurable)
            .where(
                Measurable.company_id == meeting.company_id,
                Measurable.team_id == meeting.team_id,
            )
            .order_by(Measurable.id)
        )
    ).scalars().all()
    scores = (
        (
            await db.execute(
                select(Score).where(
                    Score.company_id == meeting.company_id,
                    Score.measurable_id.in_([m.id for m in measurables]),
                    Score.week_start == scorecard_week,
                )
            )
        )
        .scalars()
        .all()
        if measurables
        else []
    )
    score_map = {s.measurable_id: s.value for s in scores}

    measurable_status: dict[str, str] = {}
    measurables_detail: list[MeetingSummaryMeasurableItem] = []
    for m in measurables:
        val = score_map.get(m.id)
        st = evaluate_measurable_score(
            m.goal_type,
            m.goal_value,
            m.goal_min,
            m.goal_max,
            val,
            is_current_week=False,
        )
        measurable_status[m.id] = st
        owner = users.get(m.owner_id)
        measurables_detail.append(
            MeetingSummaryMeasurableItem(
                measurable_id=m.id,
                name=m.name,
                owner_name=owner.name if owner else m.owner_id,
                unit=m.unit,
                score_value=decimal_to_number(val) if val is not None else None,
                status=st,
            )
        )

    solved_issues = (
        await db.execute(
            select(Issue)
            .where(
                Issue.company_id == meeting.company_id,
                Issue.team_id == meeting.team_id,
                or_(
                    Issue.solved_in_meeting_id == meeting.id,
                    and_(
                        Issue.solved_in_meeting_id.is_(None),
                        Issue.solved_at.is_not(None),
                        Issue.solved_at >= meeting.started_at,
                        Issue.solved_at <= meeting.ended_at,
                    ),
                ),
            )
            .order_by(Issue.id)
        )
    ).scalars().all()

    created_todos = (
        await db.execute(
            select(Todo)
            .where(
                Todo.company_id == meeting.company_id,
                Todo.team_id == meeting.team_id,
                or_(
                    Todo.created_in_meeting_id == meeting.id,
                    and_(
                        Todo.created_in_meeting_id.is_(None),
                        Todo.created_at >= meeting.started_at,
                        Todo.created_at <= meeting.ended_at,
                    ),
                ),
            )
            .order_by(Todo.id)
        )
    ).scalars().all()

    att_rows = (
        await db.execute(
            select(MeetingAttendee)
            .where(MeetingAttendee.meeting_id == meeting.id)
            .order_by(MeetingAttendee.user_id)
        )
    ).scalars().all()
    rt_rows = (
        await db.execute(
            select(MeetingRating).where(MeetingRating.meeting_id == meeting.id)
        )
    ).scalars().all()

    rating_vals = [
        rt.rating
        for rt in rt_rows
        if (u := users.get(rt.user_id)) is not None and u.role != "observer"
    ]
    avg_rating = (
        round_half_up_1dec(sum(rating_vals), len(rating_vals))
        if rating_vals
        else None
    )
    fac = users.get(meeting.facilitator_id)

    attendees_detail = [
        MeetingAttendeeRead(
            user_id=att.user_id,
            name=users[att.user_id].name,
            role=users[att.user_id].role,
            joined_at=att.joined_at,
        )
        for att in att_rows
        if att.user_id in users
    ]

    return MeetingSummaryRead(
        meeting_id=meeting.id,
        team_id=meeting.team_id,
        facilitator_id=meeting.facilitator_id,
        facilitator_name=fac.name if fac else meeting.facilitator_id,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
        scorecard_week=scorecard_week,
        measurable_status=measurable_status,
        issues_solved=[i.id for i in solved_issues],
        todos_created=[t.id for t in created_todos],
        attendee_ids=[a.user_id for a in attendees_detail],
        rating=avg_rating,
        measurables_detail=measurables_detail,
        issues_solved_detail=[
            MeetingSummaryIssueItem(
                id=i.id,
                title=i.title,
                owner_name=users[i.owner_id].name if i.owner_id in users else i.owner_id,
                resolution_note=i.resolution_note,
                solved_at=i.solved_at,
            )
            for i in solved_issues
        ],
        todos_created_detail=[
            MeetingSummaryTodoItem(
                id=t.id,
                title=t.title,
                owner_name=users[t.owner_id].name if t.owner_id in users else t.owner_id,
                due_date=t.due_date,
                created_at=t.created_at,
            )
            for t in created_todos
        ],
        attendees_detail=attendees_detail,
    )


async def end_meeting(
    db: AsyncSession, *, meeting_id: str, user: User
) -> MeetingSummaryRead:
    """Facilitator-only end meeting: freezes immutable summary_snapshot in PostgreSQL."""
    if user.role == "observer":
        raise AppError(
            403,
            "OBSERVER_READ_ONLY",
            "Observers cannot end meetings.",
        )

    meeting = await _get_authorized_meeting(db, meeting_id, user)
    if meeting.status != "active":
        raise AppError(409, "MEETING_ENDED", "Meeting has already ended.")
    if meeting.facilitator_id != user.id:
        raise AppError(
            403,
            "NOT_FACILITATOR",
            "Only the meeting facilitator can end the meeting.",
        )

    company = (
        await db.execute(select(Company).where(Company.id == user.company_id))
    ).scalar_one()
    app_now = get_app_now()
    ended_at = app_now if app_now >= meeting.started_at else meeting.started_at

    meeting.status = "ended"
    meeting.current_section = "ended"
    meeting.ended_at = ended_at

    summary = await _build_summary_details(db, meeting, company)
    snapshot = {
        "scorecard_week": summary.scorecard_week.isoformat(),
        "measurable_status": summary.measurable_status,
        "issues_solved": summary.issues_solved,
        "todos_created": summary.todos_created,
        "attendee_ids": summary.attendee_ids,
        "rating": summary.rating,
        "_detail": {
            "facilitator_name": summary.facilitator_name,
            "measurables_detail": [
                m.model_dump(mode="json") for m in summary.measurables_detail
            ],
            "issues_solved_detail": [
                i.model_dump(mode="json") for i in summary.issues_solved_detail
            ],
            "todos_created_detail": [
                t.model_dump(mode="json") for t in summary.todos_created_detail
            ],
            "attendees_detail": [
                a.model_dump(mode="json") for a in summary.attendees_detail
            ],
        },
    }

    await db.execute(
        update(Meeting)
        .where(Meeting.id == meeting.id)
        .values(
            status="ended",
            current_section="ended",
            ended_at=ended_at,
            summary_snapshot=snapshot,
        )
    )

    event = DomainEvent(
        event_type="MeetingEnded",
        company_id=meeting.company_id,
        team_id=meeting.team_id,
        actor_id=user.id,
        entity_type="meeting",
        entity_id=meeting.id,
        occurred_at=app_now,
        before_state={"status": "active"},
        after_state={"status": "ended", "rating": summary.rating},
        payload={"summary": summary.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return summary


async def get_meeting_summary(
    db: AsyncSession, *, meeting_id: str, user: User
) -> MeetingSummaryRead:
    """Return summary of any ended meeting (including seeded mt1 and mt2)."""
    meeting = await _get_authorized_meeting(db, meeting_id, user)
    if meeting.status != "ended":
        raise AppError(
            409,
            "MEETING_STILL_ACTIVE",
            "Meeting is still active; summary is generated when ended.",
        )
    company = (
        await db.execute(select(Company).where(Company.id == user.company_id))
    ).scalar_one()
    return await _build_summary_details(db, meeting, company)


async def _get_authorized_meeting(
    db: AsyncSession, meeting_id: str, user: User
) -> Meeting:
    from app.modules.teams.models import Membership

    meeting = (
        await db.execute(
            select(Meeting).where(
                Meeting.id == meeting_id, Meeting.company_id == user.company_id
            )
        )
    ).scalar_one_or_none()
    if meeting is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "Meeting not found.")

    if user.role != "admin":
        mem = (
            await db.execute(
                select(Membership).where(
                    Membership.user_id == user.id,
                    Membership.team_id == meeting.team_id,
                    Membership.company_id == user.company_id,
                )
            )
        ).scalar_one_or_none()
        if mem is None:
            raise AppError(404, "TEAM_NOT_FOUND", "Team not found.")

    return meeting
