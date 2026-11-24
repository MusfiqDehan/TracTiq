import json
import os
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.clock import parse_utc_iso
from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.companies.models import Company
from app.modules.issues.models import Issue
from app.modules.meetings.models import Meeting, MeetingAttendee, MeetingRating
from app.modules.rocks.models import Milestone, Rock
from app.modules.scorecard.models import Measurable, Score
from app.modules.teams.models import Membership, Team
from app.modules.todos.models import Todo


def resolve_seed_path() -> Path:
    """Locate seed.json across Docker, backend, and workspace root layouts."""
    settings = get_settings()
    candidates: list[Path] = []
    if settings.SEED_FILE_PATH:
        candidates.append(Path(settings.SEED_FILE_PATH))
    if os.environ.get("SEED_FILE_PATH"):
        candidates.append(Path(os.environ["SEED_FILE_PATH"]))

    here = Path(__file__).resolve()
    candidates.extend(
        [
            Path("/app/seed.json"),
            here.parents[3] / "docs" / "seed.json",
            here.parents[3] / "seed.json",
            here.parents[2] / "seed.json",
        ]
    )
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError(f"seed.json not found in candidates: {candidates}")


def _upsert_ignore(session: Session, model: type[Any], rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    stmt = pg_insert(model).values(rows).on_conflict_do_nothing()
    session.execute(stmt)


def seed_database(session: Session, *, reset: bool = False) -> None:
    """Load seed.json into PostgreSQL idempotently (or cleanly reset when reset=True)."""
    seed_path = resolve_seed_path()
    data = json.loads(seed_path.read_text(encoding="utf-8"))

    meta_now = parse_utc_iso(data["meta"]["now"])
    company = data["company"]
    company_id = company["id"]

    if reset:
        # Use ordered DELETE (RowExclusiveLock) instead of TRUNCATE (AccessExclusiveLock)
        # so test resets never deadlock against concurrent read-only queries.
        session.execute(text("UPDATE issues SET source_todo_id = NULL WHERE source_todo_id IS NOT NULL"))
        for table_name in (
            "audit_logs",
            "meeting_ratings",
            "meeting_attendees",
            "todos",
            "issues",
            "meetings",
            "milestones",
            "rocks",
            "scores",
            "measurables",
            "memberships",
            "teams",
            "users",
            "companies",
        ):
            session.execute(text(f"DELETE FROM {table_name}"))

    _upsert_ignore(
        session,
        Company,
        [
            {
                "id": company_id,
                "name": company["name"],
                "timezone": company["timezone"],
                "created_at": meta_now,
            }
        ],
    )

    _upsert_ignore(
        session,
        Team,
        [
            {"id": t["id"], "company_id": company_id, "name": t["name"]}
            for t in data["teams"]
        ],
    )

    _upsert_ignore(
        session,
        User,
        [
            {
                "id": u["id"],
                "company_id": company_id,
                "name": u["name"],
                "email": u["email"],
                "role": u["role"],
            }
            for u in data["users"]
        ],
    )

    _upsert_ignore(
        session,
        Membership,
        [
            {"company_id": company_id, "user_id": m["user_id"], "team_id": m["team_id"]}
            for m in data["memberships"]
        ],
    )

    _upsert_ignore(
        session,
        Measurable,
        [
            {
                "id": m["id"],
                "company_id": company_id,
                "team_id": m["team_id"],
                "name": m["name"],
                "owner_id": m["owner_id"],
                "unit": m["unit"],
                "goal_type": m["goal"]["type"],
                "goal_value": (
                    Decimal(str(m["goal"]["value"])) if "value" in m["goal"] else None
                ),
                "goal_min": Decimal(str(m["goal"]["min"])) if "min" in m["goal"] else None,
                "goal_max": Decimal(str(m["goal"]["max"])) if "max" in m["goal"] else None,
            }
            for m in data["measurables"]
        ],
    )

    _upsert_ignore(
        session,
        Score,
        [
            {
                "id": f"sc_{s['measurable_id']}_{s['week_start']}",
                "company_id": company_id,
                "measurable_id": s["measurable_id"],
                "week_start": date.fromisoformat(s["week_start"]),
                "value": Decimal(str(s["value"])),
                "version": 1,
                "updated_at": meta_now,
            }
            for s in data["scores"]
        ],
    )

    _upsert_ignore(
        session,
        Rock,
        [
            {
                "id": r["id"],
                "company_id": company_id,
                "team_id": r["team_id"],
                "title": r["title"],
                "owner_id": r["owner_id"],
                "quarter": r["quarter"],
                "status": r["status"],
            }
            for r in data["rocks"]
        ],
    )

    _upsert_ignore(
        session,
        Milestone,
        [
            {
                "id": ms["id"],
                "company_id": company_id,
                "rock_id": ms["rock_id"],
                "title": ms["title"],
                "due_date": date.fromisoformat(ms["due_date"]),
                "done": bool(ms["done"]),
            }
            for ms in data["milestones"]
        ],
    )

    _upsert_ignore(
        session,
        Meeting,
        [
            {
                "id": mt["id"],
                "company_id": company_id,
                "team_id": mt["team_id"],
                "facilitator_id": mt["facilitator_id"],
                "status": "ended",
                "current_section": "ended",
                "section_started_at": parse_utc_iso(mt["ended_at"]),
                "section_started_monotonic_ms": None,
                "started_at": parse_utc_iso(mt["started_at"]),
                "ended_at": parse_utc_iso(mt["ended_at"]),
                "summary_snapshot": None,
            }
            for mt in data["meetings"]
        ],
    )

    _upsert_ignore(
        session,
        Issue,
        [
            {
                "id": i["id"],
                "company_id": company_id,
                "team_id": i["team_id"],
                "title": i["title"],
                "owner_id": i["owner_id"],
                "priority": i["priority"],
                "created_at": parse_utc_iso(i["created_at"]),
                "solved_at": parse_utc_iso(i["solved_at"]) if i["solved_at"] else None,
                "resolution_note": i["resolution_note"],
                "source_measurable_id": i["source"]["measurable_id"] if i["source"] else None,
                "source_week_start": (
                    date.fromisoformat(i["source"]["week_start"]) if i["source"] else None
                ),
                "source_rock_id": None,
                "source_todo_id": None,
                "solved_in_meeting_id": None,
                "version": 1,
            }
            for i in data["issues"]
        ],
    )

    _upsert_ignore(
        session,
        Todo,
        [
            {
                "id": t["id"],
                "company_id": company_id,
                "team_id": t["team_id"],
                "title": t["title"],
                "owner_id": t["owner_id"],
                "due_date": date.fromisoformat(t["due_date"]),
                "done_at": parse_utc_iso(t["done_at"]) if t["done_at"] else None,
                "source_issue_id": t["source_issue_id"],
                "created_in_meeting_id": None,
                "created_at": parse_utc_iso(t["created_at"]),
            }
            for t in data["todos"]
        ],
    )

    attendees: list[dict[str, Any]] = []
    ratings: list[dict[str, Any]] = []
    for mt in data["meetings"]:
        started_at = parse_utc_iso(mt["started_at"])
        ended_at = parse_utc_iso(mt["ended_at"])
        for uid in mt["attendee_ids"]:
            attendees.append(
                {
                    "company_id": company_id,
                    "meeting_id": mt["id"],
                    "user_id": uid,
                    "joined_at": started_at,
                }
            )
        for r in mt["ratings"]:
            ratings.append(
                {
                    "company_id": company_id,
                    "meeting_id": mt["id"],
                    "user_id": r["user_id"],
                    "rating": r["rating"],
                    "updated_at": ended_at,
                }
            )

    _upsert_ignore(session, MeetingAttendee, attendees)
    _upsert_ignore(session, MeetingRating, ratings)
    session.commit()
