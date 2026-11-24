from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class GoalRead(BaseModel):
    type: str
    value: int | float | None = None
    min: int | float | None = None
    max: int | float | None = None


class ScoreCellRead(BaseModel):
    score_id: str | None = None
    measurable_id: str
    week_start: date
    value: int | float | None = None
    status: str
    version: int | None = None
    updated_at: datetime | None = None
    unsolved_issue_id: str | None = None


class MeasurableRowRead(BaseModel):
    id: str
    team_id: str
    name: str
    owner_id: str
    owner_name: str
    unit: str
    goal: GoalRead
    cells: dict[str, ScoreCellRead]


class ScorecardRead(BaseModel):
    team_id: str
    weeks: list[date]
    current_week: date
    last_closed_week: date
    measurables: list[MeasurableRowRead]


class ScoreUpsertRequest(BaseModel):
    value: Decimal = Field(
        ...,
        allow_inf_nan=False,
        ge=Decimal("-99999999999999.9999"),
        le=Decimal("99999999999999.9999"),
    )
    expected_version: int | None = Field(default=None, ge=0)
