from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Measurable(Base):
    __tablename__ = "measurables"
    __table_args__ = (
        CheckConstraint("btrim(name) <> ''", name="ck_measurables_name_nonempty"),
        CheckConstraint(
            "goal_type IN ('at_least', 'at_most', 'between', 'exactly')",
            name="ck_measurables_goal_type",
        ),
        CheckConstraint(
            "(goal_type = 'between' AND goal_min IS NOT NULL AND goal_max IS NOT NULL "
            "AND goal_min <= goal_max AND goal_value IS NULL) OR "
            "(goal_type <> 'between' AND goal_value IS NOT NULL "
            "AND goal_min IS NULL AND goal_max IS NULL)",
            name="ck_measurables_goal_shape",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    goal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    goal_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    goal_min: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    goal_max: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (
        UniqueConstraint("measurable_id", "week_start", name="uq_scores_measurable_week"),
        CheckConstraint("EXTRACT(ISODOW FROM week_start) = 1", name="ck_scores_week_is_monday"),
        CheckConstraint("version >= 1", name="ck_scores_version_positive"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    measurable_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("measurables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
