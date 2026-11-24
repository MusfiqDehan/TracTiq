from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''", name="ck_issues_title_nonempty"),
        CheckConstraint(
            "priority IS NULL OR (priority >= 1 AND priority <= 5)",
            name="ck_issues_priority_range",
        ),
        CheckConstraint(
            "(solved_at IS NULL AND resolution_note IS NULL) OR "
            "(solved_at IS NOT NULL AND resolution_note IS NOT NULL AND btrim(resolution_note) <> '')",
            name="ck_issues_solved_requires_note",
        ),
        CheckConstraint(
            "num_nonnulls(source_measurable_id, source_rock_id, source_todo_id) <= 1",
            name="ck_issues_at_most_one_source",
        ),
        CheckConstraint(
            "(source_measurable_id IS NULL) = (source_week_start IS NULL)",
            name="ck_issues_measurable_week_paired",
        ),
        CheckConstraint("version >= 1", name="ck_issues_version_positive"),
        Index(
            "uq_issues_unsolved_measurable_week",
            "team_id",
            "source_measurable_id",
            "source_week_start",
            unique=True,
            postgresql_where=text("solved_at IS NULL AND source_measurable_id IS NOT NULL"),
        ),
        Index(
            "uq_issues_unsolved_rock",
            "team_id",
            "source_rock_id",
            unique=True,
            postgresql_where=text("solved_at IS NULL AND source_rock_id IS NOT NULL"),
        ),
        Index(
            "uq_issues_unsolved_todo",
            "team_id",
            "source_todo_id",
            unique=True,
            postgresql_where=text("solved_at IS NULL AND source_todo_id IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    owner_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    priority: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    solved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_measurable_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("measurables.id"), nullable=True
    )
    source_week_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_rock_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("rocks.id"), nullable=True
    )
    source_todo_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("todos.id", use_alter=True, name="fk_issues_source_todo_id"),
        nullable=True,
    )
    solved_in_meeting_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("meetings.id", use_alter=True, name="fk_issues_solved_in_meeting_id"),
        nullable=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
