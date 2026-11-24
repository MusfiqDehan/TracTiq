from datetime import date, datetime

from pydantic import BaseModel


class TodoRead(BaseModel):
    id: str
    team_id: str
    title: str
    owner_id: str
    owner_name: str
    due_date: date
    done_at: datetime | None = None
    is_overdue: bool
    source_issue_id: str | None = None
    source_issue_title: str | None = None
    created_in_meeting_id: str | None = None
    created_at: datetime
    unsolved_issue_id: str | None = None


class TodoCompletionStatsRead(BaseModel):
    week_start: date
    due: int
    done: int
    rate_percent: int | None
    meets_target: bool | None


class TodosListResponse(BaseModel):
    items: list[TodoRead]
    last_closed_week: TodoCompletionStatsRead


class TodoToggleRequest(BaseModel):
    done: bool
