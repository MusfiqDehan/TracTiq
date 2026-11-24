from datetime import date

from pydantic import BaseModel


class MilestoneRead(BaseModel):
    id: str
    rock_id: str
    title: str
    due_date: date
    done: bool
    is_past_due: bool


class RockRead(BaseModel):
    id: str
    team_id: str
    title: str
    owner_id: str
    owner_name: str
    quarter: str
    seeded_status: str
    status: str
    progress_percent: int
    unsolved_issue_id: str | None = None
    milestones: list[MilestoneRead]
