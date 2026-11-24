import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import and_, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_13_week_starts, get_app_now, get_company_today
from app.core.deps import validate_owner_eligible
from app.core.errors import AppError
from app.core.events import DomainEvent, event_bus
from app.core.pagination import decode_cursor, encode_cursor
from app.core.repository import TenantRepository
from app.modules.auth.models import User
from app.modules.issues.models import Issue
from app.modules.issues.schemas import (
    IssueAddTodoRequest,
    IssueCreateRequest,
    IssueRead,
    IssueSourceRead,
    MakeIssueRequest,
    MakeIssueResult,
)
from app.modules.meetings.models import Meeting
from app.modules.rocks.models import Milestone, Rock
from app.modules.rules_report.service import (
    compute_rock_metrics,
    evaluate_measurable_score,
)
from app.modules.scorecard.models import Measurable, Score
from app.modules.todos.models import Todo
from app.modules.todos.schemas import TodoRead


class IssueRepository(TenantRepository[Issue]):
    model = Issue


async def _load_issue_context_maps(
    db: AsyncSession, company_id: str, team_id: str
) -> tuple[dict[str, str], dict[str, str], dict[str, str], dict[str, str]]:
    users = {
        u.id: u.name
        for u in (
            await db.execute(select(User).where(User.company_id == company_id))
        )
        .scalars()
        .all()
    }
    meas = {
        m.id: m.name
        for m in (
            await db.execute(
                select(Measurable).where(
                    Measurable.company_id == company_id, Measurable.team_id == team_id
                )
            )
        )
        .scalars()
        .all()
    }
    rocks = {
        r.id: r.title
        for r in (
            await db.execute(
                select(Rock).where(Rock.company_id == company_id, Rock.team_id == team_id)
            )
        )
        .scalars()
        .all()
    }
    todos = {
        t.id: t.title
        for t in (
            await db.execute(
                select(Todo).where(Todo.company_id == company_id, Todo.team_id == team_id)
            )
        )
        .scalars()
        .all()
    }
    return users, meas, rocks, todos


def _serialize_issue(
    issue: Issue,
    users: dict[str, str],
    meas: dict[str, str],
    rocks: dict[str, str],
    todos: dict[str, str],
) -> IssueRead:
    source: IssueSourceRead | None = None
    if issue.source_measurable_id is not None:
        source = IssueSourceRead(
            type="measurable",
            measurable_id=issue.source_measurable_id,
            measurable_name=meas.get(issue.source_measurable_id),
            week_start=issue.source_week_start,
        )
    elif issue.source_rock_id is not None:
        source = IssueSourceRead(
            type="rock",
            rock_id=issue.source_rock_id,
            rock_title=rocks.get(issue.source_rock_id),
        )
    elif issue.source_todo_id is not None:
        source = IssueSourceRead(
            type="todo",
            todo_id=issue.source_todo_id,
            todo_title=todos.get(issue.source_todo_id),
        )

    return IssueRead(
        id=issue.id,
        team_id=issue.team_id,
        title=issue.title,
        owner_id=issue.owner_id,
        owner_name=users.get(issue.owner_id, issue.owner_id),
        priority=issue.priority,
        created_at=issue.created_at,
        solved_at=issue.solved_at,
        resolution_note=issue.resolution_note,
        solved_in_meeting_id=issue.solved_in_meeting_id,
        version=issue.version,
        source=source,
    )


async def list_team_issues(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    status_filter: str = "unsolved",
    search: str | None = None,
    owner_id: str | None = None,
    priority: int | None = None,
    source_type: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> tuple[list[IssueRead], str | None, bool]:
    """List unsolved Issues in strict Issue order or paginated solved Issues."""
    repo = IssueRepository(db, company_id)
    stmt = repo.base_select().where(Issue.team_id == team_id)

    if status_filter == "unsolved":
        stmt = stmt.where(Issue.solved_at.is_(None))
    elif status_filter == "solved":
        stmt = stmt.where(Issue.solved_at.is_not(None))

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(Issue.title.ilike(pattern), Issue.resolution_note.ilike(pattern))
        )
    if owner_id:
        stmt = stmt.where(Issue.owner_id == owner_id)
    if priority is not None:
        stmt = stmt.where(Issue.priority == priority)
    if source_type == "measurable":
        stmt = stmt.where(Issue.source_measurable_id.is_not(None))
    elif source_type == "rock":
        stmt = stmt.where(Issue.source_rock_id.is_not(None))
    elif source_type == "todo":
        stmt = stmt.where(Issue.source_todo_id.is_not(None))

    users, meas, rocks, todos = await _load_issue_context_maps(db, company_id, team_id)

    if status_filter == "unsolved" and cursor is None:
        # Unsolved IDS list always returns full Issue-ordered set for live 1s sync
        stmt = stmt.order_by(
            Issue.priority.is_(None).asc(),
            Issue.priority.desc(),
            Issue.created_at.asc(),
            Issue.id.asc(),
        )
        rows = (await db.execute(stmt)).scalars().all()
        return (
            [_serialize_issue(i, users, meas, rocks, todos) for i in rows],
            None,
            False,
        )

    # Solved / historical pagination ordered by solved_at DESC (or created_at DESC), id DESC
    if status_filter == "solved":
        if cursor:
            c = decode_cursor(cursor)
            c_dt = datetime.fromisoformat(str(c["solved_at"]))
            c_id = str(c["id"])
            stmt = stmt.where(
                or_(
                    Issue.solved_at < c_dt,
                    and_(Issue.solved_at == c_dt, Issue.id < c_id),
                )
            )
        stmt = stmt.order_by(Issue.solved_at.desc(), Issue.id.desc()).limit(limit + 1)
    else:
        if cursor:
            c = decode_cursor(cursor)
            c_dt = datetime.fromisoformat(str(c["created_at"]))
            c_id = str(c["id"])
            stmt = stmt.where(
                or_(
                    Issue.created_at < c_dt,
                    and_(Issue.created_at == c_dt, Issue.id < c_id),
                )
            )
        stmt = stmt.order_by(Issue.created_at.desc(), Issue.id.desc()).limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor: str | None = None
    if has_more and page_rows:
        last = page_rows[-1]
        if status_filter == "solved" and last.solved_at is not None:
            next_cursor = encode_cursor(
                {"solved_at": last.solved_at.isoformat(), "id": last.id}
            )
        else:
            next_cursor = encode_cursor(
                {"created_at": last.created_at.isoformat(), "id": last.id}
            )

    return (
        [_serialize_issue(i, users, meas, rocks, todos) for i in page_rows],
        next_cursor,
        has_more,
    )


async def create_issue(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    payload: IssueCreateRequest,
) -> IssueRead:
    """Create a standalone team Issue owned by the creator."""
    app_now = get_app_now()
    issue = Issue(
        id=f"i_{uuid.uuid4().hex[:12]}",
        company_id=company_id,
        team_id=team_id,
        title=payload.title,
        owner_id=actor_id,
        priority=payload.priority,
        created_at=app_now,
        solved_at=None,
        resolution_note=None,
        version=1,
    )
    db.add(issue)
    await db.flush()

    users, meas, rocks, todos = await _load_issue_context_maps(db, company_id, team_id)
    serialized = _serialize_issue(issue, users, meas, rocks, todos)
    event = DomainEvent(
        event_type="IssueCreated",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="issue",
        entity_id=issue.id,
        occurred_at=app_now,
        before_state=None,
        after_state=serialized.model_dump(mode="json"),
        payload={"issue": serialized.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return serialized


async def make_issue_from_source(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    tz_name: str,
    payload: MakeIssueRequest,
) -> MakeIssueResult:
    """Concurrency-safe Make it an Issue for off-track Measurable+week, Rock, or overdue To-Do."""
    has_meas = payload.measurable_id is not None or payload.week_start is not None
    has_rock = payload.rock_id is not None
    has_todo = payload.todo_id is not None

    if sum([has_meas, has_rock, has_todo]) != 1:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Provide exactly one source: (measurable_id + week_start), rock_id, or todo_id.",
        )

    app_now = get_app_now()
    today = get_company_today(app_now, tz_name)
    weeks = get_13_week_starts(app_now, tz_name)
    current_week = weeks[-1]

    title = ""
    source_measurable_id: str | None = None
    source_week_start: date | None = None
    source_rock_id: str | None = None
    source_todo_id: str | None = None
    conflict_elements: list[str] = []
    conflict_where = text("")
    existing_filter = None

    if has_meas:
        if not payload.measurable_id or payload.week_start is None:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "Both measurable_id and week_start are required.",
            )
        if payload.week_start.weekday() != 0:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "week_start must be a Monday date.",
                [{"field": "week_start", "message": "Must be a Monday"}],
            )
        meas = (
            await db.execute(
                select(Measurable).where(
                    Measurable.id == payload.measurable_id,
                    Measurable.team_id == team_id,
                    Measurable.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if meas is None:
            raise AppError(404, "RESOURCE_NOT_FOUND", "Measurable not found in this team.")

        score = (
            await db.execute(
                select(Score).where(
                    Score.measurable_id == meas.id,
                    Score.week_start == payload.week_start,
                    Score.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        status = evaluate_measurable_score(
            meas.goal_type,
            meas.goal_value,
            meas.goal_min,
            meas.goal_max,
            score.value if score else None,
            is_current_week=(payload.week_start == current_week),
        )
        if status != "off_track":
            raise AppError(
                422,
                "VALIDATION_ERROR",
                f"Cannot make an Issue from a measurable cell with status '{status}'.",
            )

        title = f"{meas.name} – {payload.week_start.isoformat()}"
        source_measurable_id = meas.id
        source_week_start = payload.week_start
        conflict_elements = ["team_id", "source_measurable_id", "source_week_start"]
        conflict_where = text("solved_at IS NULL AND source_measurable_id IS NOT NULL")
        existing_filter = and_(
            Issue.company_id == company_id,
            Issue.team_id == team_id,
            Issue.source_measurable_id == meas.id,
            Issue.source_week_start == payload.week_start,
            Issue.solved_at.is_(None),
        )

    elif has_rock:
        rock = (
            await db.execute(
                select(Rock).where(
                    Rock.id == payload.rock_id,
                    Rock.team_id == team_id,
                    Rock.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if rock is None:
            raise AppError(404, "RESOURCE_NOT_FOUND", "Rock not found in this team.")

        milestones = list(
            (
                await db.execute(
                    select(Milestone).where(
                        Milestone.rock_id == rock.id, Milestone.company_id == company_id
                    )
                )
            )
            .scalars()
            .all()
        )
        metrics = compute_rock_metrics(rock, milestones, today)
        if metrics["status"] != "off_track":
            raise AppError(
                422,
                "VALIDATION_ERROR",
                f"Cannot make an Issue from a Rock with status '{metrics['status']}'.",
            )

        title = f"Off-track Rock: {rock.title}"
        source_rock_id = rock.id
        conflict_elements = ["team_id", "source_rock_id"]
        conflict_where = text("solved_at IS NULL AND source_rock_id IS NOT NULL")
        existing_filter = and_(
            Issue.company_id == company_id,
            Issue.team_id == team_id,
            Issue.source_rock_id == rock.id,
            Issue.solved_at.is_(None),
        )

    else:
        todo = (
            await db.execute(
                select(Todo).where(
                    Todo.id == payload.todo_id,
                    Todo.team_id == team_id,
                    Todo.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if todo is None:
            raise AppError(404, "RESOURCE_NOT_FOUND", "To-Do not found in this team.")

        is_overdue = todo.done_at is None and todo.due_date < today
        if not is_overdue:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "Can only make an Issue from an overdue To-Do.",
            )

        title = f"Overdue To-Do: {todo.title}"
        source_todo_id = todo.id
        conflict_elements = ["team_id", "source_todo_id"]
        conflict_where = text("solved_at IS NULL AND source_todo_id IS NOT NULL")
        existing_filter = and_(
            Issue.company_id == company_id,
            Issue.team_id == team_id,
            Issue.source_todo_id == todo.id,
            Issue.solved_at.is_(None),
        )

    new_id = f"i_{uuid.uuid4().hex[:12]}"
    stmt = (
        pg_insert(Issue)
        .values(
            id=new_id,
            company_id=company_id,
            team_id=team_id,
            title=title,
            owner_id=actor_id,
            priority=None,
            created_at=app_now,
            solved_at=None,
            resolution_note=None,
            source_measurable_id=source_measurable_id,
            source_week_start=source_week_start,
            source_rock_id=source_rock_id,
            source_todo_id=source_todo_id,
            version=1,
        )
        .on_conflict_do_nothing(
            index_elements=conflict_elements,
            index_where=conflict_where,
        )
        .returning(Issue)
    )

    inserted = (await db.execute(stmt)).scalar_one_or_none()
    users, meas_map, rocks_map, todos_map = await _load_issue_context_maps(
        db, company_id, team_id
    )

    if inserted is not None:
        serialized = _serialize_issue(inserted, users, meas_map, rocks_map, todos_map)
        event = DomainEvent(
            event_type="IssueCreated",
            company_id=company_id,
            team_id=team_id,
            actor_id=actor_id,
            entity_type="issue",
            entity_id=inserted.id,
            occurred_at=app_now,
            before_state=None,
            after_state=serialized.model_dump(mode="json"),
            payload={"issue": serialized.model_dump(mode="json")},
        )
        await event_bus.stage_in_tx(db, event)
        await db.commit()
        await event_bus.publish_committed(event)
        return MakeIssueResult(created=True, issue=serialized)

    # Conflict hit: rollback empty write side and fetch the existing committed unsolved Issue
    await db.rollback()
    existing = (await db.execute(select(Issue).where(existing_filter))).scalar_one()
    serialized = _serialize_issue(existing, users, meas_map, rocks_map, todos_map)
    return MakeIssueResult(created=False, issue=serialized)


async def update_issue_priority(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    issue_id: str,
    priority: int | None,
    expected_version: int | None,
) -> IssueRead:
    """Update Issue priority with optional If-Match / expected_version protection."""
    existing = (
        await db.execute(
            select(Issue).where(
                Issue.id == issue_id,
                Issue.team_id == team_id,
                Issue.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "Issue not found.")

    users, meas_map, rocks_map, todos_map = await _load_issue_context_maps(
        db, company_id, team_id
    )

    if expected_version is not None and existing.version != expected_version:
        current = _serialize_issue(existing, users, meas_map, rocks_map, todos_map)
        raise AppError(
            409,
            "CONFLICT_STALE_VERSION",
            "Issue was updated by another user. Refresh and retry.",
            {"current": current.model_dump(mode="json")},
        )

    before_state = {"priority": existing.priority, "version": existing.version}
    stmt = update(Issue).where(Issue.id == existing.id, Issue.company_id == company_id)
    if expected_version is not None:
        stmt = stmt.where(Issue.version == expected_version)
    stmt = stmt.values(priority=priority, version=Issue.version + 1).returning(Issue)

    saved = (await db.execute(stmt)).scalar_one_or_none()
    if saved is None:
        latest = (
            await db.execute(select(Issue).where(Issue.id == existing.id))
        ).scalar_one()
        current = _serialize_issue(latest, users, meas_map, rocks_map, todos_map)
        raise AppError(
            409,
            "CONFLICT_STALE_VERSION",
            "Issue was modified concurrently by another user.",
            {"current": current.model_dump(mode="json")},
        )

    serialized = _serialize_issue(saved, users, meas_map, rocks_map, todos_map)
    app_now = get_app_now()
    event = DomainEvent(
        event_type="IssuePriorityUpdated",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="issue",
        entity_id=saved.id,
        occurred_at=app_now,
        before_state=before_state,
        after_state={"priority": saved.priority, "version": saved.version},
        payload={"issue": serialized.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return serialized


async def solve_issue(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    issue_id: str,
    resolution_note: str,
) -> IssueRead:
    """Solve an unsolved Issue with a required resolution note."""
    existing = (
        await db.execute(
            select(Issue).where(
                Issue.id == issue_id,
                Issue.team_id == team_id,
                Issue.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "Issue not found.")
    if existing.solved_at is not None:
        raise AppError(409, "CONFLICT", "Issue is already solved.")

    active_meeting = (
        await db.execute(
            select(Meeting).where(
                Meeting.team_id == team_id,
                Meeting.company_id == company_id,
                Meeting.status == "active",
            )
        )
    ).scalar_one_or_none()

    app_now = get_app_now()
    before_state = {"solved_at": None, "version": existing.version}

    saved = (
        await db.execute(
            update(Issue)
            .where(Issue.id == existing.id, Issue.solved_at.is_(None))
            .values(
                solved_at=app_now,
                resolution_note=resolution_note,
                solved_in_meeting_id=active_meeting.id if active_meeting else None,
                version=Issue.version + 1,
            )
            .returning(Issue)
        )
    ).scalar_one()

    users, meas_map, rocks_map, todos_map = await _load_issue_context_maps(
        db, company_id, team_id
    )
    serialized = _serialize_issue(saved, users, meas_map, rocks_map, todos_map)
    event = DomainEvent(
        event_type="IssueSolved",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="issue",
        entity_id=saved.id,
        occurred_at=app_now,
        before_state=before_state,
        after_state={
            "solved_at": saved.solved_at.isoformat() if saved.solved_at else None,
            "resolution_note": saved.resolution_note,
            "solved_in_meeting_id": saved.solved_in_meeting_id,
        },
        payload={"issue": serialized.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return serialized


async def add_todo_from_issue(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    tz_name: str,
    issue_id: str,
    payload: IssueAddTodoRequest,
) -> TodoRead:
    """Create a 7-day To-Do linked to a source Issue, verifying eligible non-Observer owner."""
    issue = (
        await db.execute(
            select(Issue).where(
                Issue.id == issue_id,
                Issue.team_id == team_id,
                Issue.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    if issue is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "Source Issue not found.")

    owner = await validate_owner_eligible(db, team_id, company_id, payload.owner_id)
    app_now = get_app_now()
    today = get_company_today(app_now, tz_name)
    due_date = today + timedelta(days=7)

    active_meeting = (
        await db.execute(
            select(Meeting).where(
                Meeting.team_id == team_id,
                Meeting.company_id == company_id,
                Meeting.status == "active",
            )
        )
    ).scalar_one_or_none()

    todo = Todo(
        id=f"t_{uuid.uuid4().hex[:12]}",
        company_id=company_id,
        team_id=team_id,
        title=payload.title,
        owner_id=owner.id,
        due_date=due_date,
        done_at=None,
        source_issue_id=issue.id,
        created_in_meeting_id=active_meeting.id if active_meeting else None,
        created_at=app_now,
    )
    db.add(todo)
    await db.flush()

    todo_read = TodoRead(
        id=todo.id,
        team_id=todo.team_id,
        title=todo.title,
        owner_id=todo.owner_id,
        owner_name=owner.name,
        due_date=todo.due_date,
        done_at=todo.done_at,
        is_overdue=False,
        source_issue_id=todo.source_issue_id,
        source_issue_title=issue.title,
        created_in_meeting_id=todo.created_in_meeting_id,
        created_at=todo.created_at,
        unsolved_issue_id=None,
    )
    event = DomainEvent(
        event_type="TodoCreated",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="todo",
        entity_id=todo.id,
        occurred_at=app_now,
        before_state=None,
        after_state=todo_read.model_dump(mode="json"),
        payload={"todo": todo_read.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return todo_read
