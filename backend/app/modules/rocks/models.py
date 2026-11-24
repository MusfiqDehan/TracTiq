from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Rock(Base):
    __tablename__ = "rocks"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''", name="ck_rocks_title_nonempty"),
        CheckConstraint(
            "status IN ('on_track', 'off_track', 'complete')",
            name="ck_rocks_status_valid",
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
    quarter: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)


class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''", name="ck_milestones_title_nonempty"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rock_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("rocks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
