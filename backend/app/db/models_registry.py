"""Import all SQLAlchemy models so Alembic metadata discovers every table."""

from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.companies.models import Company
from app.modules.issues.models import Issue
from app.modules.meetings.models import Meeting, MeetingAttendee, MeetingRating
from app.modules.rocks.models import Milestone, Rock
from app.modules.scorecard.models import Measurable, Score
from app.modules.teams.models import Membership, Team
from app.modules.todos.models import Todo

__all__ = [
    "AuditLog",
    "Company",
    "Issue",
    "Measurable",
    "Meeting",
    "MeetingAttendee",
    "MeetingRating",
    "Membership",
    "Milestone",
    "Rock",
    "Score",
    "Team",
    "Todo",
    "User",
]
