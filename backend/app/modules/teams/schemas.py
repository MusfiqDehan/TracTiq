from datetime import date

from pydantic import BaseModel

from app.modules.issues.schemas import IssueRead
from app.modules.meetings.schemas import MeetingActiveRead, MeetingListItemRead
from app.modules.rocks.schemas import RockRead
from app.modules.scorecard.schemas import ScorecardRead
from app.modules.todos.schemas import TodosListResponse


class EligibleOwnerRead(BaseModel):
    id: str
    name: str
    email: str
    role: str


class TeamDetailRead(BaseModel):
    id: str
    name: str
    company_id: str
    company_name: str
    company_timezone: str
    current_user_role: str
    can_write: bool
    today: date
    eligible_owners: list[EligibleOwnerRead]
    active_meeting: MeetingActiveRead | None = None


class TeamOverviewRead(BaseModel):
    team: TeamDetailRead
    scorecard: ScorecardRead
    unsolved_issues: list[IssueRead]
    todos: TodosListResponse
    rocks: list[RockRead]
    ended_meetings: list[MeetingListItemRead]
