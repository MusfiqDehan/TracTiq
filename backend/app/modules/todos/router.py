from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TeamContext, get_authorized_team, require_team_writer
from app.core.responses import ApiResponse, make_response
from app.modules.todos.schemas import TodoRead, TodosListResponse, TodoToggleRequest
from app.modules.todos.service import list_team_todos, toggle_todo_done

router = APIRouter(prefix="/api/teams/{team_id}/todos", tags=["todos"])


@router.get("", response_model=ApiResponse[TodosListResponse])
async def get_todos(
    request: Request,
    status: Literal["all", "open", "done", "overdue"] = Query(default="all"),
    owner_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TodosListResponse]:
    """Return team To-Dos with overdue flags, last closed week completion rate, and pagination."""
    payload, next_cursor, has_more = await list_team_todos(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        tz_name=ctx.company.timezone,
        status_filter=status,
        owner_id=owner_id,
        search=search,
        cursor=cursor,
        limit=limit,
    )
    return make_response(payload, request, next_cursor=next_cursor, has_more=has_more)


@router.patch("/{todo_id}", response_model=ApiResponse[TodoRead])
async def patch_todo(
    todo_id: str,
    body: TodoToggleRequest,
    request: Request,
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TodoRead]:
    """Mark a To-Do done or undo completion."""
    todo = await toggle_todo_done(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        tz_name=ctx.company.timezone,
        todo_id=todo_id,
        done=body.done,
    )
    return make_response(todo, request)
