from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Todo(Base):
    __tablename__ = "todos"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''", name="ck_todos_title_nonempty"),
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
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_issue_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("issues.id"), nullable=True
    )
    created_in_meeting_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("meetings.id", use_alter=True, name="fk_todos_created_in_meeting_id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
