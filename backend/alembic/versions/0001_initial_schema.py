"""Initial TracTiq schema with tenant scoping, integrity checks, partial indexes, and triggers.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-23 02:38:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_initial_schema"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("timezone", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_companies_name_nonempty"),
        sa.CheckConstraint("btrim(timezone) <> ''", name="ck_companies_timezone_nonempty"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "teams",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_teams_name_nonempty"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_teams_company_id", "teams", ["company_id"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_users_name_nonempty"),
        sa.CheckConstraint(
            "role IN ('admin', 'team_member', 'observer')", name="ck_users_role_valid"
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "email", name="uq_users_company_email"),
    )
    op.create_index("ix_users_company_id", "users", ["company_id"], unique=False)

    op.create_table(
        "memberships",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "team_id"),
    )
    op.create_index("ix_memberships_company_id", "memberships", ["company_id"], unique=False)
    op.create_index("ix_memberships_team_id", "memberships", ["team_id"], unique=False)

    op.create_table(
        "measurables",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("goal_type", sa.String(length=32), nullable=False),
        sa.Column("goal_value", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("goal_min", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("goal_max", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_measurables_name_nonempty"),
        sa.CheckConstraint(
            "goal_type IN ('at_least', 'at_most', 'between', 'exactly')",
            name="ck_measurables_goal_type",
        ),
        sa.CheckConstraint(
            "(goal_type = 'between' AND goal_min IS NOT NULL AND goal_max IS NOT NULL "
            "AND goal_min <= goal_max AND goal_value IS NULL) OR "
            "(goal_type <> 'between' AND goal_value IS NOT NULL "
            "AND goal_min IS NULL AND goal_max IS NULL)",
            name="ck_measurables_goal_shape",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_measurables_company_id", "measurables", ["company_id"], unique=False)
    op.create_index("ix_measurables_team_id", "measurables", ["team_id"], unique=False)

    op.create_table(
        "scores",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("measurable_id", sa.String(length=64), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("EXTRACT(ISODOW FROM week_start) = 1", name="ck_scores_week_is_monday"),
        sa.CheckConstraint("version >= 1", name="ck_scores_version_positive"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["measurable_id"], ["measurables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("measurable_id", "week_start", name="uq_scores_measurable_week"),
    )
    op.create_index("ix_scores_company_id", "scores", ["company_id"], unique=False)
    op.create_index("ix_scores_measurable_id", "scores", ["measurable_id"], unique=False)
    op.create_index("ix_scores_week_start", "scores", ["week_start"], unique=False)

    op.create_table(
        "rocks",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("quarter", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''", name="ck_rocks_title_nonempty"),
        sa.CheckConstraint(
            "status IN ('on_track', 'off_track', 'complete')", name="ck_rocks_status_valid"
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rocks_company_id", "rocks", ["company_id"], unique=False)
    op.create_index("ix_rocks_team_id", "rocks", ["team_id"], unique=False)

    op.create_table(
        "milestones",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("rock_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''", name="ck_milestones_title_nonempty"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rock_id"], ["rocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_milestones_company_id", "milestones", ["company_id"], unique=False)
    op.create_index("ix_milestones_rock_id", "milestones", ["rock_id"], unique=False)

    op.create_table(
        "meetings",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("facilitator_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("current_section", sa.String(length=32), nullable=False),
        sa.Column("section_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("section_started_monotonic_ms", sa.BigInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.CheckConstraint("status IN ('active', 'ended')", name="ck_meetings_status_valid"),
        sa.CheckConstraint(
            "(status = 'active' AND ended_at IS NULL) OR "
            "(status = 'ended' AND ended_at IS NOT NULL)",
            name="ck_meetings_status_ended_at",
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facilitator_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meetings_company_id", "meetings", ["company_id"], unique=False)
    op.create_index("ix_meetings_team_id", "meetings", ["team_id"], unique=False)
    op.create_index(
        "uq_meetings_one_active_per_team",
        "meetings",
        ["team_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "issues",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("solved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("source_measurable_id", sa.String(length=64), nullable=True),
        sa.Column("source_week_start", sa.Date(), nullable=True),
        sa.Column("source_rock_id", sa.String(length=64), nullable=True),
        sa.Column("source_todo_id", sa.String(length=64), nullable=True),
        sa.Column("solved_in_meeting_id", sa.String(length=64), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''", name="ck_issues_title_nonempty"),
        sa.CheckConstraint(
            "priority IS NULL OR (priority >= 1 AND priority <= 5)",
            name="ck_issues_priority_range",
        ),
        sa.CheckConstraint(
            "(solved_at IS NULL AND resolution_note IS NULL) OR "
            "(solved_at IS NOT NULL AND resolution_note IS NOT NULL AND btrim(resolution_note) <> '')",
            name="ck_issues_solved_requires_note",
        ),
        sa.CheckConstraint(
            "num_nonnulls(source_measurable_id, source_rock_id, source_todo_id) <= 1",
            name="ck_issues_at_most_one_source",
        ),
        sa.CheckConstraint(
            "(source_measurable_id IS NULL) = (source_week_start IS NULL)",
            name="ck_issues_measurable_week_paired",
        ),
        sa.CheckConstraint("version >= 1", name="ck_issues_version_positive"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_measurable_id"], ["measurables.id"]),
        sa.ForeignKeyConstraint(["source_rock_id"], ["rocks.id"]),
        sa.ForeignKeyConstraint(
            ["solved_in_meeting_id"], ["meetings.id"], name="fk_issues_solved_in_meeting_id"
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_issues_company_id", "issues", ["company_id"], unique=False)
    op.create_index("ix_issues_team_id", "issues", ["team_id"], unique=False)
    op.create_index(
        "uq_issues_unsolved_measurable_week",
        "issues",
        ["team_id", "source_measurable_id", "source_week_start"],
        unique=True,
        postgresql_where=sa.text("solved_at IS NULL AND source_measurable_id IS NOT NULL"),
    )
    op.create_index(
        "uq_issues_unsolved_rock",
        "issues",
        ["team_id", "source_rock_id"],
        unique=True,
        postgresql_where=sa.text("solved_at IS NULL AND source_rock_id IS NOT NULL"),
    )
    op.create_index(
        "uq_issues_unsolved_todo",
        "issues",
        ["team_id", "source_todo_id"],
        unique=True,
        postgresql_where=sa.text("solved_at IS NULL AND source_todo_id IS NOT NULL"),
    )

    op.create_table(
        "todos",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_issue_id", sa.String(length=64), nullable=True),
        sa.Column("created_in_meeting_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''", name="ck_todos_title_nonempty"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_issue_id"], ["issues.id"]),
        sa.ForeignKeyConstraint(
            ["created_in_meeting_id"], ["meetings.id"], name="fk_todos_created_in_meeting_id"
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_todos_company_id", "todos", ["company_id"], unique=False)
    op.create_index("ix_todos_due_date", "todos", ["due_date"], unique=False)
    op.create_index("ix_todos_team_id", "todos", ["team_id"], unique=False)

    op.create_foreign_key(
        "fk_issues_source_todo_id", "issues", "todos", ["source_todo_id"], ["id"]
    )

    op.create_table(
        "meeting_attendees",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("meeting_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("meeting_id", "user_id"),
    )
    op.create_index(
        "ix_meeting_attendees_company_id", "meeting_attendees", ["company_id"], unique=False
    )

    op.create_table(
        "meeting_ratings",
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("meeting_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating >= 1 AND rating <= 10", name="ck_meeting_ratings_range"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("meeting_id", "user_id"),
    )
    op.create_index(
        "ix_meeting_ratings_company_id", "meeting_ratings", ["company_id"], unique=False
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("actor_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_company_id", "audit_logs", ["company_id"], unique=False)
    op.create_index("ix_audit_logs_team_id", "audit_logs", ["team_id"], unique=False)
    op.create_index(
        "ix_audit_logs_team_created_id",
        "audit_logs",
        ["company_id", "team_id", "created_at", "id"],
        unique=False,
    )

    # DB-level trigger rejecting Observer ownership/facilitation/rating and cross-team ownership
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_enforce_non_observer_and_team_member()
        RETURNS TRIGGER AS $$
        DECLARE
            v_user_id VARCHAR;
            v_team_id VARCHAR;
            v_company_id VARCHAR;
            v_role VARCHAR;
        BEGIN
            IF TG_TABLE_NAME = 'meeting_ratings' THEN
                v_user_id := NEW.user_id;
                SELECT team_id, company_id INTO v_team_id, v_company_id
                FROM meetings WHERE id = NEW.meeting_id;
            ELSIF TG_TABLE_NAME = 'meetings' THEN
                v_user_id := NEW.facilitator_id;
                v_team_id := NEW.team_id;
                v_company_id := NEW.company_id;
            ELSE
                v_user_id := NEW.owner_id;
                v_team_id := NEW.team_id;
                v_company_id := NEW.company_id;
            END IF;

            SELECT role INTO v_role
            FROM users
            WHERE id = v_user_id AND company_id = v_company_id;

            IF v_role IS NULL THEN
                RAISE EXCEPTION 'User % does not belong to company %', v_user_id, v_company_id
                    USING ERRCODE = '23514';
            END IF;

            IF v_role = 'observer' THEN
                RAISE EXCEPTION 'Observers cannot own items, facilitate meetings, or submit ratings (user %)', v_user_id
                    USING ERRCODE = '23514';
            END IF;

            IF v_role <> 'admin' AND NOT EXISTS (
                SELECT 1 FROM memberships m
                WHERE m.user_id = v_user_id
                  AND m.team_id = v_team_id
                  AND m.company_id = v_company_id
            ) THEN
                RAISE EXCEPTION 'User % is not a member of team %', v_user_id, v_team_id
                    USING ERRCODE = '23514';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    for tbl in ("measurables", "rocks", "issues", "todos", "meetings", "meeting_ratings"):
        op.execute(
            f"""
            CREATE TRIGGER trg_{tbl}_non_observer
            BEFORE INSERT OR UPDATE ON {tbl}
            FOR EACH ROW
            EXECUTE FUNCTION fn_enforce_non_observer_and_team_member();
            """
        )


def downgrade() -> None:
    for tbl in ("meeting_ratings", "meetings", "todos", "issues", "rocks", "measurables"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{tbl}_non_observer ON {tbl};")
    op.execute("DROP FUNCTION IF EXISTS fn_enforce_non_observer_and_team_member();")

    op.drop_table("audit_logs")
    op.drop_table("meeting_ratings")
    op.drop_table("meeting_attendees")
    op.drop_constraint("fk_issues_source_todo_id", "issues", type_="foreignkey")
    op.drop_table("todos")
    op.drop_table("issues")
    op.drop_table("meetings")
    op.drop_table("milestones")
    op.drop_table("rocks")
    op.drop_table("scores")
    op.drop_table("measurables")
    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("teams")
    op.drop_table("companies")
