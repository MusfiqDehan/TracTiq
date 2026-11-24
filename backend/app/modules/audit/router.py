from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TeamContext, get_authorized_team
from app.core.responses import ApiResponse, make_response
from app.modules.audit.schemas import AuditLogRead
from app.modules.audit.service import list_audit_logs

router = APIRouter(prefix="/api/teams/{team_id}/audit-logs", tags=["audit"])


@router.get("", response_model=ApiResponse[list[AuditLogRead]])
async def get_audit_logs(
    request: Request,
    entity_type: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=200),
    ctx: TeamContext = Depends(get_authorized_team),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[AuditLogRead]]:
    """List team audit trail entries with cursor pagination and filters."""
    items, next_cursor, has_more = await list_audit_logs(
        db,
        company_id=ctx.company.id,
        team_id=ctx.team.id,
        entity_type=entity_type,
        actor_id=actor_id,
        action=action,
        cursor=cursor,
        limit=limit,
    )
    return make_response(items, request, next_cursor=next_cursor, has_more=has_more)
