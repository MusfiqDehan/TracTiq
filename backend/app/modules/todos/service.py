from datetime import date, timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_13_week_starts, get_app_now, get_company_today
from app.core.errors import AppError
from app.core.events import DomainEvent, event_bus
from app.core.pagination import decode_cursor, encode_cursor
from app.core.repository import TenantRepository
from app.modules.auth.models import User
from app.modules.issues.models import Issue
from app.modules.rules_report.service import compute_todo_completion_for_week
from app.modules.todos.models import Todo
from app.modules.todos.schemas import (
    TodoCompletionStatsRead,
    TodoRead,
    TodosListResponse,
)


class TodoRepository(TenantRepository[Todo]):
    model = Todo


async def list_team_todos(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    tz_name: str,
    status_filter: str = "all",
    owner_id: str | None = None,
    search: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> tuple[TodosListResponse, str | None, bool]:
    """List To-Dos with overdue flags, last closed week completion rate, search, and pagination."""
    app_now = get_app_now()
    today = get_company_today(app_now, tz_name)
    weeks = get_13_week_starts(app_now, tz_name)
    last_closed_week = weeks[-1] - timedelta(days=7)

    repo = TodoRepository(db, company_id)
    all_todos = list(
        (await db.execute(repo.base_select().where(Todo.team_id == team_id)))
        .scalars()
        .all()
    )

    stats = compute_todo_completion_for_week(all_todos, last_closed_week, tz_name)
    completion_stats = TodoCompletionStatsRead(
        week_start=last_closed_week,
        due=stats["due"] if stats else 0,
        done=stats["done"] if stats else 0,
        rate_percent=stats["rate_percent"] if stats else None,
        meets_target=stats["meets_target"] if stats else None,
    )

    stmt = repo.base_select().where(Todo.team_id == team_id)
    if status_filter == "open":
        stmt = stmt.where(Todo.done_at.is_(None))
    elif status_filter == "done":
        stmt = stmt.where(Todo.done_at.is_not(None))
    elif status_filter == "overdue":
        stmt = stmt.where(Todo.done_at.is_(None), Todo.due_date < today)

    if owner_id:
        stmt = stmt.where(Todo.owner_id == owner_id)
    if search and search.strip():
        stmt = stmt.where(Todo.title.ilike(f"%{search.strip()}%"))

    if cursor:
        c = decode_cursor(cursor)
        c_due = date.fromisoformat(str(c["due_date"]))
        c_id = str(c["id"])
        stmt = stmt.where(
            or_(
                Todo.due_date < c_due,
                and_(Todo.due_date == c_due, Todo.id < c_id),
            )
        )

    stmt = stmt.order_by(Todo.due_date.desc(), Todo.id.desc()).limit(limit + 1)
    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor: str | None = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = encode_cursor(
            {"due_date": last.due_date.isoformat(), "id": last.id}
        )

    users = {
        u.id: u.name
        for u in (
            await db.execute(select(User).where(User.company_id == company_id))
        )
        .scalars()
        .all()
    }
    issues_all = (
        await db.execute(
            select(Issue).where(Issue.company_id == company_id, Issue.team_id == team_id)
        )
    ).scalars().all()
    issue_titles = {i.id: i.title for i in issues_all}
    issue_by_todo = {
        i.source_todo_id: i.id
        for i in issues_all
        if i.solved_at is None and i.source_todo_id is not None
    }

    items = [
        TodoRead(
            id=t.id,
            team_id=t.team_id,
            title=t.title,
            owner_id=t.owner_id,
            owner_name=users.get(t.owner_id, t.owner_id),
            due_date=t.due_date,
            done_at=t.done_at,
            is_overdue=(t.done_at is None and t.due_date < today),
            source_issue_id=t.source_issue_id,
            source_issue_title=(
                issue_titles.get(t.source_issue_id) if t.source_issue_id else None
            ),
            created_in_meeting_id=t.created_in_meeting_id,
            created_at=t.created_at,
            unsolved_issue_id=issue_by_todo.get(t.id),
        )
        for t in page_rows
    ]

    return (
        TodosListResponse(items=items, last_closed_week=completion_stats),
        next_cursor,
        has_more,
    )


async def toggle_todo_done(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    actor_id: str,
    tz_name: str,
    todo_id: str,
    done: bool,
) -> TodoRead:
    """Mark a To-Do done or undo completion."""
    existing = (
        await db.execute(
            select(Todo).where(
                Todo.id == todo_id,
                Todo.team_id == team_id,
                Todo.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "To-Do not found.")

    app_now = get_app_now()
    today = get_company_today(app_now, tz_name)
    before_state = {
        "done_at": existing.done_at.isoformat() if existing.done_at else None
    }
    new_done_at = app_now if done else None

    saved = (
        await db.execute(
            update(Todo)
            .where(Todo.id == existing.id, Todo.company_id == company_id)
            .values(done_at=new_done_at)
            .returning(Todo)
        )
    ).scalar_one()

    owner = (
        await db.execute(select(User).where(User.id == saved.owner_id))
    ).scalar_one()
    source_issue_title: str | None = None
    if saved.source_issue_id:
        source_issue_title = (
            await db.execute(
                select(Issue.title).where(Issue.id == saved.source_issue_id)
            )
        ).scalar_one_or_none()

    unsolved_issue_id = (
        await db.execute(
            select(Issue.id).where(
                Issue.company_id == company_id,
                Issue.team_id == team_id,
                Issue.source_todo_id == saved.id,
                Issue.solved_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    todo_read = TodoRead(
        id=saved.id,
        team_id=saved.team_id,
        title=saved.title,
        owner_id=saved.owner_id,
        owner_name=owner.name,
        due_date=saved.due_date,
        done_at=saved.done_at,
        is_overdue=(saved.done_at is None and saved.due_date < today),
        source_issue_id=saved.source_issue_id,
        source_issue_title=source_issue_title,
        created_in_meeting_id=saved.created_in_meeting_id,
        created_at=saved.created_at,
        unsolved_issue_id=unsolved_issue_id,
    )

    event = DomainEvent(
        event_type="TodoToggled",
        company_id=company_id,
        team_id=team_id,
        actor_id=actor_id,
        entity_type="todo",
        entity_id=saved.id,
        occurred_at=app_now,
        before_state=before_state,
        after_state={
            "done_at": saved.done_at.isoformat() if saved.done_at else None
        },
        payload={"todo": todo_read.model_dump(mode="json")},
    )
    await event_bus.stage_in_tx(db, event)
    await db.commit()
    await event_bus.publish_committed(event)
    return todo_read
