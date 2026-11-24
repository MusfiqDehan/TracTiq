from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class IssueSourceRead(BaseModel):
    type: str
    measurable_id: str | None = None
    measurable_name: str | None = None
    week_start: date | None = None
    rock_id: str | None = None
    rock_title: str | None = None
    todo_id: str | None = None
    todo_title: str | None = None


class IssueRead(BaseModel):
    id: str
    team_id: str
    title: str
    owner_id: str
    owner_name: str
    priority: int | None = None
    created_at: datetime
    solved_at: datetime | None = None
    resolution_note: str | None = None
    solved_in_meeting_id: str | None = None
    version: int
    source: IssueSourceRead | None = None


class IssueCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    priority: int | None = Field(default=None, ge=1, le=5)

    @field_validator("title")
    @classmethod
    def strip_nonempty(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Title cannot be blank.")
        return cleaned


class MakeIssueRequest(BaseModel):
    measurable_id: str | None = None
    week_start: date | None = None
    rock_id: str | None = None
    todo_id: str | None = None


class MakeIssueResult(BaseModel):
    created: bool
    issue: IssueRead


class IssueUpdateRequest(BaseModel):
    priority: int | None = Field(default=None, ge=1, le=5)
    expected_version: int | None = Field(default=None, ge=1)


class IssueSolveRequest(BaseModel):
    resolution_note: str = Field(..., min_length=1)

    @field_validator("resolution_note")
    @classmethod
    def strip_note(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Resolution note is required.")
        return cleaned


class IssueAddTodoRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    owner_id: str = Field(..., min_length=1)

    @field_validator("title")
    @classmethod
    def strip_todo_title(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("To-Do title cannot be blank.")
        return cleaned
