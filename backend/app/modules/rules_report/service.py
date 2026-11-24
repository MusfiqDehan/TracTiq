from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import get_13_week_starts, get_company_today, get_week_start, to_company_tz
from app.modules.auth.models import User
from app.modules.companies.models import Company
from app.modules.issues.models import Issue
from app.modules.meetings.models import Meeting, MeetingAttendee, MeetingRating
from app.modules.rocks.models import Milestone, Rock
from app.modules.scorecard.models import Measurable, Score
from app.modules.teams.models import Team
from app.modules.todos.models import Todo


def round_half_up_int(numerator: int | Decimal, denominator: int | Decimal) -> int:
    """Compute whole-number percentage using ROUND_HALF_UP (never banker's rounding)."""
    ratio = (Decimal(numerator) * Decimal(100)) / Decimal(denominator)
    return int(ratio.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def round_half_up_1dec(total: int | Decimal, count: int) -> float:
    """Compute average to 1 decimal place using ROUND_HALF_UP."""
    avg = Decimal(total) / Decimal(count)
    return float(avg.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def evaluate_measurable_score(
    goal_type: str,
    goal_value: Decimal | None,
    goal_min: Decimal | None,
    goal_max: Decimal | None,
    score_value: Decimal | None,
    *,
    is_current_week: bool,
) -> str:
    """Evaluate a measurable's weekly status ('on_track' | 'off_track' | 'pending')."""
    if score_value is None:
        return "pending" if is_current_week else "off_track"

    if goal_type == "at_least" and goal_value is not None:
        return "on_track" if score_value >= goal_value else "off_track"
    if goal_type == "at_most" and goal_value is not None:
        return "on_track" if score_value <= goal_value else "off_track"
    if goal_type == "between" and goal_min is not None and goal_max is not None:
        return "on_track" if goal_min <= score_value <= goal_max else "off_track"
    if goal_type == "exactly" and goal_value is not None:
        return "on_track" if score_value == goal_value else "off_track"
    return "off_track"


def compute_todo_completion_for_week(
    todos: list[Todo],
    week_start: date,
    tz_name: str,
) -> dict[str, Any] | None:
    """Compute To-Do completion rate for a single Monday week_start, or None if 0 due."""
    week_end = week_start + timedelta(days=6)
    due_todos = [t for t in todos if week_start <= t.due_date <= week_end]
    due_count = len(due_todos)
    if due_count == 0:
        return None

    done_count = sum(
        1
        for t in due_todos
        if t.done_at is not None and to_company_tz(t.done_at, tz_name).date() <= week_end
    )
    rate_percent = round_half_up_int(done_count, due_count)
    # Compare exact ratio done/due >= 9/10 without rounding error
    meets_target = (done_count * 10) >= (due_count * 9)
    return {
        "due": due_count,
        "done": done_count,
        "rate_percent": rate_percent,
        "meets_target": meets_target,
    }


def compute_overdue_todo_ids(todos: list[Todo], today: date) -> list[str]:
    """Return plain-string sorted IDs of incomplete To-Dos whose due_date < today."""
    return sorted(
        t.id for t in todos if t.done_at is None and t.due_date < today
    )


def compute_rock_metrics(
    rock: Rock, milestones: list[Milestone], today: date
) -> dict[str, Any]:
    """Compute Rock status ('on_track' | 'off_track' | 'complete') and progress_percent."""
    total = len(milestones)
    done_count = sum(1 for ms in milestones if ms.done)

    if rock.status == "complete":
        computed_status = "complete"
    elif rock.status == "off_track":
        computed_status = "off_track"
    elif any((not ms.done) and ms.due_date < today for ms in milestones):
        computed_status = "off_track"
    else:
        computed_status = "on_track"

    if total == 0:
        progress_percent = 100 if computed_status == "complete" else 0
    else:
        progress_percent = round_half_up_int(done_count, total)

    return {
        "status": computed_status,
        "progress_percent": progress_percent,
    }


def compute_issue_order_ids(issues: list[Issue]) -> list[str]:
    """Order unsolved issues: priority 5..1 DESC, oldest first, no-priority last."""
    unsolved = [i for i in issues if i.solved_at is None]
    unsolved.sort(
        key=lambda i: (
            i.priority is None,
            -(i.priority or 0),
            i.created_at,
            i.id,
        )
    )
    return [i.id for i in unsolved]


def compute_meeting_summary_data(
    meeting: Meeting,
    *,
    tz_name: str,
    team_measurables: list[Measurable],
    score_map: dict[tuple[str, date], Decimal],
    team_issues: list[Issue],
    team_todos: list[Todo],
    attendee_ids: list[str],
    ratings: list[int],
    current_week: date,
) -> dict[str, Any]:
    """Compute ended meeting summary (from frozen snapshot if present, else raw data)."""
    if meeting.summary_snapshot is not None:
        return {
            "scorecard_week": meeting.summary_snapshot["scorecard_week"],
            "measurable_status": meeting.summary_snapshot["measurable_status"],
            "issues_solved": meeting.summary_snapshot["issues_solved"],
            "todos_created": meeting.summary_snapshot["todos_created"],
            "attendee_ids": meeting.summary_snapshot["attendee_ids"],
            "rating": meeting.summary_snapshot["rating"],
        }

    assert meeting.ended_at is not None
    meeting_start_local = to_company_tz(meeting.started_at, tz_name).date()
    scorecard_week = get_week_start(meeting_start_local) - timedelta(days=7)

    measurable_status: dict[str, str] = {}
    for m in sorted(team_measurables, key=lambda x: x.id):
        val = score_map.get((m.id, scorecard_week))
        measurable_status[m.id] = evaluate_measurable_score(
            m.goal_type,
            m.goal_value,
            m.goal_min,
            m.goal_max,
            val,
            is_current_week=False,
        )

    issues_solved = sorted(
        i.id
        for i in team_issues
        if i.solved_at is not None and meeting.started_at <= i.solved_at <= meeting.ended_at
    )
    todos_created = sorted(
        t.id
        for t in team_todos
        if meeting.started_at <= t.created_at <= meeting.ended_at
    )
    avg_rating = round_half_up_1dec(sum(ratings), len(ratings)) if ratings else None

    return {
        "scorecard_week": scorecard_week.isoformat(),
        "measurable_status": measurable_status,
        "issues_solved": issues_solved,
        "todos_created": todos_created,
        "attendee_ids": sorted(attendee_ids),
        "rating": avg_rating,
    }


def generate_rules_report(session: Session, app_now: datetime) -> dict[str, Any]:
    """Generate the full rules report dictionary matching README.md spec."""
    companies = {
        c.id: c for c in session.execute(select(Company)).scalars().all()
    }
    teams = sorted(session.execute(select(Team)).scalars().all(), key=lambda t: t.id)
    measurables = session.execute(select(Measurable)).scalars().all()
    scores = session.execute(select(Score)).scalars().all()
    rocks = session.execute(select(Rock)).scalars().all()
    milestones = session.execute(select(Milestone)).scalars().all()
    issues = session.execute(select(Issue)).scalars().all()
    todos = session.execute(select(Todo)).scalars().all()
    meetings = session.execute(select(Meeting)).scalars().all()
    attendees = session.execute(select(MeetingAttendee)).scalars().all()
    ratings = session.execute(select(MeetingRating)).scalars().all()
    users = {u.id: u for u in session.execute(select(User)).scalars().all()}

    score_map: dict[tuple[str, date], Decimal] = {
        (s.measurable_id, s.week_start): s.value for s in scores
    }

    milestones_by_rock: dict[str, list[Milestone]] = {}
    for ms in milestones:
        milestones_by_rock.setdefault(ms.rock_id, []).append(ms)

    attendees_by_meeting: dict[str, list[str]] = {}
    for att in attendees:
        attendees_by_meeting.setdefault(att.meeting_id, []).append(att.user_id)

    ratings_by_meeting: dict[str, list[int]] = {}
    for rt in ratings:
        user = users.get(rt.user_id)
        if user is not None and user.role != "observer":
            ratings_by_meeting.setdefault(rt.meeting_id, []).append(rt.rating)

    teams_output: dict[str, Any] = {}
    for team in teams:
        tz_name = companies[team.company_id].timezone
        today = get_company_today(app_now, tz_name)
        week_starts = get_13_week_starts(app_now, tz_name)
        current_week = week_starts[-1]

        team_measurables = sorted(
            [m for m in measurables if m.team_id == team.id], key=lambda x: x.id
        )
        team_rocks = sorted(
            [r for r in rocks if r.team_id == team.id], key=lambda x: x.id
        )
        team_issues = [i for i in issues if i.team_id == team.id]
        team_todos = [t for t in todos if t.team_id == team.id]
        team_ended_meetings = sorted(
            [m for m in meetings if m.team_id == team.id and m.status == "ended"],
            key=lambda x: x.id,
        )

        measurable_status_out: dict[str, dict[str, str]] = {}
        for m in team_measurables:
            measurable_status_out[m.id] = {
                w.isoformat(): evaluate_measurable_score(
                    m.goal_type,
                    m.goal_value,
                    m.goal_min,
                    m.goal_max,
                    score_map.get((m.id, w)),
                    is_current_week=(w == current_week),
                )
                for w in week_starts
            }

        todo_completion_out: dict[str, dict[str, Any] | None] = {
            w.isoformat(): compute_todo_completion_for_week(team_todos, w, tz_name)
            for w in week_starts
        }

        rocks_out: dict[str, dict[str, Any]] = {
            r.id: compute_rock_metrics(r, milestones_by_rock.get(r.id, []), today)
            for r in team_rocks
        }

        meetings_out: dict[str, dict[str, Any]] = {
            mt.id: compute_meeting_summary_data(
                mt,
                tz_name=tz_name,
                team_measurables=team_measurables,
                score_map=score_map,
                team_issues=team_issues,
                team_todos=team_todos,
                attendee_ids=attendees_by_meeting.get(mt.id, []),
                ratings=ratings_by_meeting.get(mt.id, []),
                current_week=current_week,
            )
            for mt in team_ended_meetings
        }

        teams_output[team.id] = {
            "measurable_status": measurable_status_out,
            "todo_completion": todo_completion_out,
            "overdue_todos": compute_overdue_todo_ids(team_todos, today),
            "rocks": rocks_out,
            "issue_order": compute_issue_order_ids(team_issues),
            "meetings": meetings_out,
        }

    return {
        "now": app_now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "teams": teams_output,
    }
