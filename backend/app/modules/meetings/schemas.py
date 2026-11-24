from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class MeetingSectionTimerRead(BaseModel):
    current_section: str
    section_label: str
    allocated_seconds: int
    elapsed_seconds: int
    remaining_seconds: int
    is_overtime: bool
    overtime_seconds: int


class MeetingAttendeeRead(BaseModel):
    user_id: str
    name: str
    role: str
    joined_at: datetime


class MeetingRatingRead(BaseModel):
    user_id: str
    name: str
    rating: int
    updated_at: datetime


class MeetingActiveRead(BaseModel):
    id: str
    team_id: str
    facilitator_id: str
    facilitator_name: str
    status: str
    current_section: str
    scorecard_week: date
    started_at: datetime
    section_started_at: datetime
    timer: MeetingSectionTimerRead
    attendees: list[MeetingAttendeeRead]
    ratings: list[MeetingRatingRead]
    average_rating: float | None
    issues_solved_ids: list[str]
    todos_created_ids: list[str]
    agenda: list[dict[str, Any]]


class MeetingSummaryMeasurableItem(BaseModel):
    measurable_id: str
    name: str
    owner_name: str
    unit: str
    score_value: int | float | None = None
    status: str


class MeetingSummaryIssueItem(BaseModel):
    id: str
    title: str
    owner_name: str
    resolution_note: str | None = None
    solved_at: datetime | None = None


class MeetingSummaryTodoItem(BaseModel):
    id: str
    title: str
    owner_name: str
    due_date: date
    created_at: datetime


class MeetingSummaryRead(BaseModel):
    meeting_id: str
    team_id: str
    facilitator_id: str
    facilitator_name: str
    started_at: datetime
    ended_at: datetime
    scorecard_week: date
    measurable_status: dict[str, str]
    issues_solved: list[str]
    todos_created: list[str]
    attendee_ids: list[str]
    rating: float | None
    measurables_detail: list[MeetingSummaryMeasurableItem]
    issues_solved_detail: list[MeetingSummaryIssueItem]
    todos_created_detail: list[MeetingSummaryTodoItem]
    attendees_detail: list[MeetingAttendeeRead]


class MeetingListItemRead(BaseModel):
    id: str
    team_id: str
    facilitator_id: str
    facilitator_name: str
    status: str
    started_at: datetime
    ended_at: datetime | None = None
    rating: float | None = None


class MeetingRateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=10)
