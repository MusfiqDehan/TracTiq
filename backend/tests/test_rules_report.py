import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from app.core.clock import get_app_now, parse_utc_iso
from app.core.database import get_sync_session_factory
from app.modules.rocks.models import Milestone, Rock
from app.modules.rules_report.service import (
    compute_issue_order_ids,
    compute_rock_metrics,
    compute_todo_completion_for_week,
    evaluate_measurable_score,
    generate_rules_report,
    round_half_up_1dec,
    round_half_up_int,
)
from app.modules.todos.models import Todo


def test_rules_report_matches_committed_golden_json() -> None:
    golden_path = Path(__file__).resolve().parents[2] / "rules_report.json"
    expected = json.loads(golden_path.read_text(encoding="utf-8"))

    with get_sync_session_factory()() as session:
        actual = generate_rules_report(session, get_app_now("2026-11-11T15:00:00Z"))

    assert actual == expected


def test_rounding_half_up_boundaries() -> None:
    # 12.5% -> 13 (not banker's 12), 8.25 -> 8.3 (not banker's 8.2)
    assert round_half_up_int(1, 8) == 13
    assert round_half_up_1dec(33, 4) == 8.3


def test_measurable_status_all_goal_types_and_missing_weeks() -> None:
    # Boundaries are on_track
    assert evaluate_measurable_score("at_least", Decimal("10"), None, None, Decimal("10"), is_current_week=False) == "on_track"
    assert evaluate_measurable_score("at_least", Decimal("10"), None, None, Decimal("9.9"), is_current_week=False) == "off_track"
    assert evaluate_measurable_score("at_most", Decimal("3.0"), None, None, Decimal("3.0"), is_current_week=False) == "on_track"
    assert evaluate_measurable_score("at_most", Decimal("3.0"), None, None, Decimal("3.1"), is_current_week=False) == "off_track"
    assert evaluate_measurable_score("between", None, Decimal("2"), Decimal("4"), Decimal("2"), is_current_week=False) == "on_track"
    assert evaluate_measurable_score("between", None, Decimal("2"), Decimal("4"), Decimal("4"), is_current_week=False) == "on_track"
    assert evaluate_measurable_score("between", None, Decimal("2"), Decimal("4"), Decimal("4.1"), is_current_week=False) == "off_track"
    assert evaluate_measurable_score("exactly", Decimal("1"), None, None, Decimal("1"), is_current_week=False) == "on_track"
    assert evaluate_measurable_score("exactly", Decimal("1"), None, None, Decimal("0"), is_current_week=False) == "off_track"

    # Missing score in closed vs current week
    assert evaluate_measurable_score("at_least", Decimal("10"), None, None, None, is_current_week=False) == "off_track"
    assert evaluate_measurable_score("at_least", Decimal("10"), None, None, None, is_current_week=True) == "pending"
    # Present score in current week evaluates normally (m5 case)
    assert evaluate_measurable_score("at_least", Decimal("500"), None, None, Decimal("520"), is_current_week=True) == "on_track"


def test_todo_completion_exact_ratio_vs_rounded_percent() -> None:
    # 179/200 = 89.5% -> rounds half up to 90%, yet exact ratio < 0.90 -> meets_target MUST be False
    week = date(2026, 11, 2)
    todos = [
        Todo(
            id=f"td_{i}",
            company_id="co_1",
            team_id="team_lead",
            title=f"Task {i}",
            owner_id="u2",
            due_date=date(2026, 11, 4),
            done_at=datetime(2026, 11, 4, 15, 0, tzinfo=UTC) if i < 179 else None,
            created_at=datetime(2026, 11, 2, 15, 0, tzinfo=UTC),
        )
        for i in range(200)
    ]
    res = compute_todo_completion_for_week(todos, week, "America/Chicago")
    assert res is not None
    assert res["rate_percent"] == 90
    assert res["meets_target"] is False

    # Zero due -> None
    assert compute_todo_completion_for_week([], week, "America/Chicago") is None


def test_rock_today_boundary_and_empty_milestones() -> None:
    today = date(2026, 11, 11)
    r_due_today = Rock(id="rx1", company_id="co_1", team_id="team_lead", title="R1", owner_id="u2", quarter="2026-Q4", status="on_track")
    ms_today = [Milestone(id="msx1", company_id="co_1", rock_id="rx1", title="M1", due_date=date(2026, 11, 11), done=False)]
    assert compute_rock_metrics(r_due_today, ms_today, today) == {"status": "on_track", "progress_percent": 0}

    ms_past = [Milestone(id="msx2", company_id="co_1", rock_id="rx1", title="M2", due_date=date(2026, 11, 10), done=False)]
    assert compute_rock_metrics(r_due_today, ms_past, today) == {"status": "off_track", "progress_percent": 0}

    r_complete = Rock(id="rx2", company_id="co_1", team_id="team_lead", title="R2", owner_id="u2", quarter="2026-Q4", status="complete")
    assert compute_rock_metrics(r_complete, [], today) == {"status": "complete", "progress_percent": 100}


def test_issue_order_with_null_priority_last() -> None:
    from app.modules.issues.models import Issue

    issues = [
        Issue(id="a", company_id="co_1", team_id="team_lead", title="No prio", owner_id="u2", priority=None, created_at=datetime(2026, 9, 1, tzinfo=UTC)),
        Issue(id="b", company_id="co_1", team_id="team_lead", title="P3", owner_id="u2", priority=3, created_at=datetime(2026, 10, 5, tzinfo=UTC)),
        Issue(id="c", company_id="co_1", team_id="team_lead", title="P5 newer", owner_id="u2", priority=5, created_at=datetime(2026, 10, 20, tzinfo=UTC)),
        Issue(id="d", company_id="co_1", team_id="team_lead", title="P5 older", owner_id="u2", priority=5, created_at=datetime(2026, 10, 14, tzinfo=UTC)),
        Issue(id="e", company_id="co_1", team_id="team_lead", title="Solved", owner_id="u2", priority=5, created_at=datetime(2026, 10, 1, tzinfo=UTC), solved_at=datetime(2026, 10, 2, tzinfo=UTC), resolution_note="Done"),
    ]
    assert compute_issue_order_ids(issues) == ["d", "c", "b", "a"]


def test_rules_report_shifted_app_now_dates() -> None:
    with get_sync_session_factory()() as session:
        # 1. Exact Monday 00:00:00 CST (2026-11-09T06:00:00Z)
        # On 2026-11-09, t12 (due 11-01) is overdue, t31 (due 11-10) is NOT overdue yet!
        rep_mon = generate_rules_report(session, parse_utc_iso("2026-11-09T06:00:00Z"))
        assert rep_mon["teams"]["team_lead"]["overdue_todos"] == ["t12"]
        assert "2026-11-09" in rep_mon["teams"]["team_lead"]["measurable_status"]["m1"]
        assert rep_mon["teams"]["team_lead"]["measurable_status"]["m1"]["2026-11-09"] == "pending"

        # 2. Just before DST end (2026-11-01T06:30:00Z = Sun Nov 1 01:30 CDT) vs just after (2026-11-01T07:30:00Z = Sun Nov 1 01:30 CST)
        # Current week on Sun Nov 1 is still 2026-10-26!
        rep_pre_dst = generate_rules_report(session, parse_utc_iso("2026-11-01T06:30:00Z"))
        rep_post_dst = generate_rules_report(session, parse_utc_iso("2026-11-01T07:30:00Z"))
        assert list(rep_pre_dst["teams"]["team_lead"]["measurable_status"]["m1"].keys())[-1] == "2026-10-26"
        assert list(rep_post_dst["teams"]["team_lead"]["measurable_status"]["m1"].keys())[-1] == "2026-10-26"
        # t12 due 2026-11-01 is NOT overdue on 2026-11-01
        assert rep_post_dst["teams"]["team_lead"]["overdue_todos"] == []

        # 3. Start of Q4 (2026-10-01T15:00:00Z) -> week of 2026-09-28
        rep_q4 = generate_rules_report(session, parse_utc_iso("2026-10-01T15:00:00Z"))
        assert list(rep_q4["teams"]["team_lead"]["measurable_status"]["m1"].keys())[-1] == "2026-09-28"

        # 4. One week later (2026-11-18T15:00:00Z) -> week of 2026-11-16; t30, t31, t32, t40 all overdue; m5 on 11-09 still on_track, 11-16 pending
        rep_next = generate_rules_report(session, parse_utc_iso("2026-11-18T15:00:00Z"))
        assert rep_next["teams"]["team_lead"]["overdue_todos"] == ["t12", "t30", "t31", "t32"]
        assert rep_next["teams"]["team_sales"]["overdue_todos"] == ["t40"]
        assert rep_next["teams"]["team_lead"]["measurable_status"]["m1"]["2026-11-09"] == "off_track"
        assert rep_next["teams"]["team_lead"]["measurable_status"]["m5"]["2026-11-16"] == "pending"

        # 5. Shifted into mt1's scorecard_week (2026-10-19) -> mt1 summary still evaluates m5 as off_track (closed week)
        rep_oct = generate_rules_report(session, parse_utc_iso("2026-10-21T15:00:00Z"))
        assert rep_oct["teams"]["team_lead"]["meetings"]["mt1"]["measurable_status"]["m5"] == "off_track"
