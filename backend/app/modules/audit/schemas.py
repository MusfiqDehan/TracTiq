from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuditLogDetail(BaseModel):
    label: str
    value: str | None = None
    before: str | None = None
    after: str | None = None


class AuditLogRead(BaseModel):
    id: str
    team_id: str
    actor_id: str
    actor_name: str
    action: str
    action_label: str
    entity_type: str
    entity_id: str
    entity_label: str
    summary: str
    details: list[AuditLogDetail] = Field(default_factory=list)
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    created_at: datetime
