from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'ended')", name="ck_meetings_status_valid"),
        CheckConstraint(
            "(status = 'active' AND ended_at IS NULL) OR "
            "(status = 'ended' AND ended_at IS NOT NULL)",
            name="ck_meetings_status_ended_at",
        ),
        Index(
            "uq_meetings_one_active_per_team",
            "team_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    facilitator_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    current_section: Mapped[str] = mapped_column(String(32), nullable=False)
    section_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    section_started_monotonic_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class MeetingAttendee(Base):
    __tablename__ = "meeting_attendees"

    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    meeting_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MeetingRating(Base):
    __tablename__ = "meeting_ratings"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 10", name="ck_meeting_ratings_range"),
    )

    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    meeting_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
