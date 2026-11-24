from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.concurrency import parse_expected_version
from app.core.database import get_db
from app.core.deps import TeamContext, get_authorized_team, require_team_writer
from app.core.responses import ApiResponse, make_response
from app.modules.issues.schemas import (
    IssueAddTodoRequest,
    IssueCreateRequest,
    IssueRead,
    IssueSolveRequest,
    IssueUpdateRequest,
    MakeIssueRequest,
    MakeIssueResult,
)
from app.modules.issues.service import (
    add_todo_from_issue,
    create_issue,
    list_team_issues,
    make_issue_from_source,
    solve_issue,
    update_issue_priority,
)
from app.modules.todos.schemas import TodoRead

router = APIRouter(prefix="/api/teams/{team_id}", tags=["issues"])


@router.get("/issues", response_model=ApiResponse[list[IssueRead]])
async def get_issues(
    request: Request,
    status: Literal["unsolved", "solved", "all"] = Query(default="unsolved"),
    search: str | None = Query(default=None),
    owner_id: str | None = Query(default=None),
    priority: int | None = Query(default=None, ge=1, le=5),
    source_type: Literal["measurable", "rock", "todo"] | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[IssueRead]]:
    """List unsolved Issues in strict Issue order, or cursor-paginated solved Issues."""
    items, next_cursor, has_more = await list_team_issues(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        status_filter=status,
        search=search,
        owner_id=owner_id,
        priority=priority,
        source_type=source_type,
        cursor=cursor,
        limit=limit,
    )
    return make_response(items, request, next_cursor=next_cursor, has_more=has_more)


@router.post("/issues", response_model=ApiResponse[IssueRead], status_code=201)
async def post_issue(
    body: IssueCreateRequest,
    request: Request,
    response: Response,
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[IssueRead]:
    """Create a new Issue owned by the creator."""
    issue = await create_issue(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        payload=body,
    )
    response.headers["ETag"] = f'W/"{issue.version}"'
    return make_response(issue, request)


@router.post("/issues/make-issue", response_model=ApiResponse[MakeIssueResult])
@router.post("/scorecard/make-issue", response_model=ApiResponse[MakeIssueResult])
async def post_make_issue(
    body: MakeIssueRequest,
    request: Request,
    response: Response,
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[MakeIssueResult]:
    """Concurrency-safe Make it an Issue from off-track Measurable+week, Rock, or overdue To-Do."""
    result = await make_issue_from_source(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        tz_name=ctx.company.timezone,
        payload=body,
    )
    response.status_code = 201 if result.created else 200
    response.headers["ETag"] = f'W/"{result.issue.version}"'
    return make_response(result, request)


@router.patch("/issues/{issue_id}", response_model=ApiResponse[IssueRead])
async def patch_issue(
    issue_id: str,
    body: IssueUpdateRequest,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[IssueRead]:
    """Update Issue priority with optional If-Match optimistic concurrency."""
    expected_version = parse_expected_version(if_match, body.expected_version)
    issue = await update_issue_priority(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        issue_id=issue_id,
        priority=body.priority,
        expected_version=expected_version,
    )
    response.headers["ETag"] = f'W/"{issue.version}"'
    return make_response(issue, request)


@router.post("/issues/{issue_id}/solve", response_model=ApiResponse[IssueRead])
async def post_solve_issue(
    issue_id: str,
    body: IssueSolveRequest,
    request: Request,
    response: Response,
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[IssueRead]:
    """Solve an Issue with a required resolution note."""
    issue = await solve_issue(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        issue_id=issue_id,
        resolution_note=body.resolution_note,
    )
    response.headers["ETag"] = f'W/"{issue.version}"'
    return make_response(issue, request)


@router.post(
    "/issues/{issue_id}/todos", response_model=ApiResponse[TodoRead], status_code=201
)
async def post_issue_todo(
    issue_id: str,
    body: IssueAddTodoRequest,
    request: Request,
    ctx: TeamContext = Depends(require_team_writer),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TodoRead]:
    """Add a 7-day To-Do linked to a source Issue."""
    todo = await add_todo_from_issue(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        actor_id=ctx.user.id,
        tz_name=ctx.company.timezone,
        issue_id=issue_id,
        payload=body,
    )
    return make_response(todo, request)
