import re
from datetime import date, datetime
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import decode_cursor, encode_cursor
from app.core.repository import TenantRepository
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogDetail, AuditLogRead
from app.modules.auth.models import User
from app.modules.issues.models import Issue
from app.modules.meetings.agenda import SECTION_BY_KEY
from app.modules.scorecard.models import Measurable, Score
from app.modules.todos.models import Todo


class AuditRepository(TenantRepository[AuditLog]):
    model = AuditLog


_ENTITY_TYPE_LABELS: dict[str, str] = {
    "issue": "Issue",
    "todo": "To-Do",
    "score": "Scorecard Metric",
    "meeting": "Level 10 Meeting",
    "rock": "Rock",
}

_STATUS_LABELS: dict[str, str] = {
    "on_track": "On Track",
    "off_track": "Off Track",
    "pending": "Pending",
    "active": "Active",
    "ended": "Ended",
    "complete": "Complete",
}

_IGNORED_FALLBACK_KEYS: set[str] = {
    "id",
    "company_id",
    "team_id",
    "owner_id",
    "actor_id",
    "measurable_id",
    "source_issue_id",
    "solved_in_meeting_id",
    "created_in_meeting_id",
    "unsolved_issue_id",
    "version",
    "created_at",
    "updated_at",
}


def _humanize_identifier(text: str) -> str:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    spaced = spaced.replace("_", " ").replace("-", " ")
    return " ".join(word.capitalize() for word in spaced.split())


def _format_iso_date(raw: Any, *, include_year: bool = True) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    try:
        dt = date.fromisoformat(raw[:10])
    except ValueError:
        return raw
    if include_year:
        return f"{dt.strftime('%b')} {dt.day}, {dt.year}"
    return f"{dt.strftime('%b')} {dt.day}"


def _format_priority(raw: Any) -> str:
    if raw is None:
        return "Unranked"
    return f"#{raw}"


def _format_number(raw: Any) -> str:
    if isinstance(raw, bool):
        return "Yes" if raw else "No"
    if isinstance(raw, int):
        return f"{raw:,}"
    if isinstance(raw, float):
        if raw.is_integer():
            return f"{int(raw):,}"
        return f"{raw:,.2f}".rstrip("0").rstrip(".")
    return str(raw)


def _format_score_value(raw: Any, unit: str | None) -> str:
    if raw is None:
        return "—"
    num = _format_number(raw)
    if not unit or unit == "count":
        return num
    if unit == "$k":
        return f"${num}k"
    if unit == "$":
        return f"${num}"
    if unit == "%":
        return f"{num}%"
    return f"{num} {unit}"


def _format_section(raw: Any) -> str:
    if not raw or not isinstance(raw, str):
        return "Unknown"
    if raw in SECTION_BY_KEY:
        return SECTION_BY_KEY[raw]["label"]
    if raw == "ended":
        return "Ended"
    return _humanize_identifier(raw)


def _format_status(raw: Any) -> str:
    if not raw or not isinstance(raw, str):
        return "—"
    return _STATUS_LABELS.get(raw, _humanize_identifier(raw))


def _format_source(source: Any) -> str | None:
    if not isinstance(source, dict):
        return None
    src_type = source.get("type")
    if src_type == "measurable":
        name = source.get("measurable_name") or "Measurable"
        week = _format_iso_date(source.get("week_start"), include_year=False)
        return f'Scorecard "{name}" (Week of {week})' if week else f'Scorecard "{name}"'
    if src_type == "rock":
        title = source.get("rock_title") or "Rock"
        return f'Rock "{title}"'
    if src_type == "todo":
        title = source.get("todo_title") or "To-Do"
        return f'To-Do "{title}"'
    return None


def _format_fallback_value(val: Any) -> str:
    if val is None:
        return "None"
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, (int, float)):
        return _format_number(val)
    if isinstance(val, str):
        if val in _STATUS_LABELS:
            return _STATUS_LABELS[val]
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", val):
            return _format_iso_date(val) or val
        return val
    if isinstance(val, list):
        return ", ".join(_format_fallback_value(v) for v in val) if val else "None"
    if isinstance(val, dict):
        parts = [
            f"{_humanize_identifier(k)}: {_format_fallback_value(v)}"
            for k, v in val.items()
            if v is not None and k not in _IGNORED_FALLBACK_KEYS
        ]
        return "; ".join(parts) if parts else "—"
    return str(val)


def _build_human_readable(
    row: AuditLog,
    *,
    actor_name: str,
    issues_map: dict[str, str],
    todos_map: dict[str, str],
    measurables_map: dict[str, tuple[str, str]],
    score_to_measurable_id: dict[str, str],
) -> tuple[str, str, str, list[AuditLogDetail]]:
    """Convert raw audit event + resolved entity context into plain-English presentation."""
    action = row.action
    before = row.before_state if isinstance(row.before_state, dict) else {}
    after = row.after_state if isinstance(row.after_state, dict) else {}
    details: list[AuditLogDetail] = []

    if action == "IssueCreated":
        title = str(after.get("title") or issues_map.get(row.entity_id) or "Untitled issue")
        if after.get("owner_name"):
            details.append(AuditLogDetail(label="Owner", value=str(after["owner_name"])))
        details.append(
            AuditLogDetail(label="Priority", value=_format_priority(after.get("priority")))
        )
        source_label = _format_source(after.get("source"))
        if source_label:
            details.append(AuditLogDetail(label="Linked From", value=source_label))
        return (
            "Created Issue",
            title,
            f'{actor_name} created issue "{title}".',
            details,
        )

    if action == "IssuePriorityUpdated":
        title = issues_map.get(row.entity_id) or "Issue"
        before_prio = _format_priority(before.get("priority"))
        after_prio = _format_priority(after.get("priority"))
        details.append(
            AuditLogDetail(label="Priority", before=before_prio, after=after_prio)
        )
        return (
            "Updated Priority",
            title,
            f'{actor_name} changed priority on "{title}" from {before_prio} to {after_prio}.',
            details,
        )

    if action == "IssueSolved":
        title = issues_map.get(row.entity_id) or "Issue"
        details.append(AuditLogDetail(label="Status", before="Open", after="Solved"))
        if after.get("resolution_note"):
            details.append(
                AuditLogDetail(label="Resolution", value=str(after["resolution_note"]))
            )
        if after.get("solved_in_meeting_id"):
            details.append(
                AuditLogDetail(label="Context", value="Solved during Level 10 Meeting")
            )
        return (
            "Solved Issue",
            title,
            f'{actor_name} solved issue "{title}".',
            details,
        )

    if action == "TodoCreated":
        title = str(after.get("title") or todos_map.get(row.entity_id) or "Untitled To-Do")
        if after.get("owner_name"):
            details.append(AuditLogDetail(label="Owner", value=str(after["owner_name"])))
        due_str = _format_iso_date(after.get("due_date"))
        if due_str:
            details.append(AuditLogDetail(label="Due Date", value=due_str))
        if after.get("source_issue_title"):
            details.append(
                AuditLogDetail(label="From Issue", value=str(after["source_issue_title"]))
            )
        if after.get("created_in_meeting_id"):
            details.append(
                AuditLogDetail(label="Context", value="Created during Level 10 Meeting")
            )
        return (
            "Created To-Do",
            title,
            f'{actor_name} created To-Do "{title}".',
            details,
        )

    if action == "TodoToggled":
        title = todos_map.get(row.entity_id) or "To-Do"
        was_done = bool(before.get("done_at"))
        is_done = bool(after.get("done_at"))
        details.append(
            AuditLogDetail(
                label="Status",
                before="Completed" if was_done else "Open",
                after="Completed" if is_done else "Open",
            )
        )
        if is_done:
            return (
                "Completed To-Do",
                title,
                f'{actor_name} marked To-Do "{title}" as completed.',
                details,
            )
        return (
            "Reopened To-Do",
            title,
            f'{actor_name} reopened To-Do "{title}".',
            details,
        )

    if action == "ScoreUpdated":
        meas_id = str(
            after.get("measurable_id")
            or before.get("measurable_id")
            or score_to_measurable_id.get(row.entity_id)
            or ""
        )
        meas_name, meas_unit = measurables_map.get(meas_id, ("Scorecard Metric", ""))
        week_str = _format_iso_date(after.get("week_start"), include_year=False)
        after_val = _format_score_value(after.get("value"), meas_unit)
        has_before = "value" in before and before.get("value") is not None

        if week_str:
            details.append(AuditLogDetail(label="Week", value=f"Week of {week_str}"))

        if has_before:
            before_val = _format_score_value(before.get("value"), meas_unit)
            details.append(AuditLogDetail(label="Score", before=before_val, after=after_val))
            action_label = "Updated Score"
            week_clause = f" for week of {week_str}" if week_str else ""
            summary = (
                f'{actor_name} updated "{meas_name}"{week_clause} '
                f"from {before_val} to {after_val}."
            )
        else:
            details.append(AuditLogDetail(label="Score", value=after_val))
            action_label = "Recorded Score"
            week_clause = f" (week of {week_str})" if week_str else ""
            summary = f'{actor_name} recorded {after_val} for "{meas_name}"{week_clause}.'

        if after.get("status"):
            details.append(
                AuditLogDetail(label="Status", value=_format_status(after.get("status")))
            )
        return (action_label, meas_name, summary, details)

    if action == "MeetingStarted":
        start_section = _format_section(after.get("current_section") or "scorecard")
        details.append(AuditLogDetail(label="Starting Section", value=start_section))
        return (
            "Started Meeting",
            "Level 10 Meeting",
            f"{actor_name} started a Level 10 Meeting.",
            details,
        )

    if action == "MeetingSectionAdvanced":
        from_section = _format_section(before.get("current_section"))
        to_section = _format_section(after.get("current_section"))
        details.append(
            AuditLogDetail(label="Section", before=from_section, after=to_section)
        )
        return (
            "Advanced Meeting",
            "Level 10 Meeting",
            f"{actor_name} moved the Level 10 Meeting from {from_section} to {to_section}.",
            details,
        )

    if action == "MeetingRated":
        rating = after.get("rating")
        rating_str = f"{_format_number(rating)} / 10" if rating is not None else "—"
        details.append(AuditLogDetail(label="Rating", value=rating_str))
        return (
            "Rated Meeting",
            "Level 10 Meeting",
            f"{actor_name} rated the Level 10 Meeting {rating_str}.",
            details,
        )

    if action == "MeetingEnded":
        details.append(AuditLogDetail(label="Status", before="Active", after="Ended"))
        rating = after.get("rating")
        if rating is not None:
            rating_str = f"{_format_number(rating)} / 10"
            details.append(AuditLogDetail(label="Average Rating", value=rating_str))
            summary = f"{actor_name} ended the Level 10 Meeting with an average rating of {rating_str}."
        else:
            summary = f"{actor_name} ended the Level 10 Meeting."
        return ("Ended Meeting", "Level 10 Meeting", summary, details)

    # Generic human-readable fallback for any other future event types
    action_label = _humanize_identifier(action)
    entity_label = _ENTITY_TYPE_LABELS.get(row.entity_type, _humanize_identifier(row.entity_type))
    all_keys = list(dict.fromkeys([*before.keys(), *after.keys()]))
    for key in all_keys:
        if key in _IGNORED_FALLBACK_KEYS:
            continue
        b_val = before.get(key)
        a_val = after.get(key)
        if key in before and key in after and b_val != a_val:
            details.append(
                AuditLogDetail(
                    label=_humanize_identifier(key),
                    before=_format_fallback_value(b_val),
                    after=_format_fallback_value(a_val),
                )
            )
        elif a_val is not None:
            details.append(
                AuditLogDetail(
                    label=_humanize_identifier(key),
                    value=_format_fallback_value(a_val),
                )
            )
    return (
        action_label,
        entity_label,
        f"{actor_name} performed {action_label.lower()} on {entity_label}.",
        details,
    )


async def list_audit_logs(
    db: AsyncSession,
    *,
    company_id: str,
    team_id: str,
    entity_type: str | None = None,
    actor_id: str | None = None,
    action: str | None = None,
    cursor: str | None = None,
    limit: int = 30,
) -> tuple[list[AuditLogRead], str | None, bool]:
    """Return cursor-paginated, filterable audit logs ordered newest first."""
    repo = AuditRepository(db, company_id)
    stmt = repo.base_select().where(AuditLog.team_id == team_id)

    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)

    if cursor:
        c = decode_cursor(cursor)
        c_dt = datetime.fromisoformat(str(c["created_at"]))
        c_id = str(c["id"])
        stmt = stmt.where(
            or_(
                AuditLog.created_at < c_dt,
                and_(AuditLog.created_at == c_dt, AuditLog.id < c_id),
            )
        )

    stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit + 1)
    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    next_cursor: str | None = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = encode_cursor(
            {"created_at": last.created_at.isoformat(), "id": last.id}
        )

    users = {
        u.id: u.name
        for u in (
            await db.execute(select(User).where(User.company_id == company_id))
        )
        .scalars()
        .all()
    }

    # Batch-resolve human-readable entity titles/names for the current page
    issue_ids = {r.entity_id for r in page_rows if r.entity_type == "issue"}
    todo_ids = {r.entity_id for r in page_rows if r.entity_type == "todo"}
    measurable_ids: set[str] = set()
    missing_score_ids: set[str] = set()
    for r in page_rows:
        if r.entity_type == "score":
            found_measurable = False
            for state in (r.after_state, r.before_state):
                if isinstance(state, dict) and state.get("measurable_id"):
                    measurable_ids.add(str(state["measurable_id"]))
                    found_measurable = True
            if not found_measurable:
                missing_score_ids.add(r.entity_id)

    issues_map: dict[str, str] = {}
    if issue_ids:
        issues_map = {
            row_id: title
            for row_id, title in (
                await db.execute(
                    select(Issue.id, Issue.title).where(
                        Issue.company_id == company_id,
                        Issue.id.in_(issue_ids),
                    )
                )
            ).all()
        }

    todos_map: dict[str, str] = {}
    if todo_ids:
        todos_map = {
            row_id: title
            for row_id, title in (
                await db.execute(
                    select(Todo.id, Todo.title).where(
                        Todo.company_id == company_id,
                        Todo.id.in_(todo_ids),
                    )
                )
            ).all()
        }

    score_to_measurable_id: dict[str, str] = {}
    if missing_score_ids:
        score_to_measurable_id = {
            s_id: m_id
            for s_id, m_id in (
                await db.execute(
                    select(Score.id, Score.measurable_id).where(
                        Score.company_id == company_id,
                        Score.id.in_(missing_score_ids),
                    )
                )
            ).all()
        }
        measurable_ids.update(score_to_measurable_id.values())

    measurables_map: dict[str, tuple[str, str]] = {}
    if measurable_ids:
        measurables_map = {
            m_id: (name, unit)
            for m_id, name, unit in (
                await db.execute(
                    select(Measurable.id, Measurable.name, Measurable.unit).where(
                        Measurable.company_id == company_id,
                        Measurable.id.in_(measurable_ids),
                    )
                )
            ).all()
        }

    items: list[AuditLogRead] = []
    for row in page_rows:
        actor_name = users.get(row.actor_id, row.actor_id)
        action_label, entity_label, summary, details = _build_human_readable(
            row,
            actor_name=actor_name,
            issues_map=issues_map,
            todos_map=todos_map,
            measurables_map=measurables_map,
            score_to_measurable_id=score_to_measurable_id,
        )
        items.append(
            AuditLogRead(
                id=row.id,
                team_id=row.team_id,
                actor_id=row.actor_id,
                actor_name=actor_name,
                action=row.action,
                action_label=action_label,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                entity_label=entity_label,
                summary=summary,
                details=details,
                before_state=row.before_state,
                after_state=row.after_state,
                created_at=row.created_at,
            )
        )
    return items, next_cursor, has_more
