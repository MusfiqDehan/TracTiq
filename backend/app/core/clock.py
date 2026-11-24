import os
import time
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings


def parse_utc_iso(value: str) -> datetime:
    """Parse an ISO 8601 timestamp string into an aware UTC datetime."""
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def get_app_now(override: str | datetime | None = None) -> datetime:
    """Return current application time in UTC from APP_NOW env var (never system clock)."""
    if isinstance(override, datetime):
        return override.replace(tzinfo=UTC) if override.tzinfo is None else override.astimezone(UTC)
    if isinstance(override, str):
        return parse_utc_iso(override)
    raw = os.environ.get("APP_NOW") or get_settings().APP_NOW
    return parse_utc_iso(raw)


def get_monotonic_ms() -> int:
    """Monotonic clock in milliseconds strictly for live meeting section countdown ticks."""
    return int(time.monotonic() * 1000)


def to_company_tz(dt: datetime, tz_name: str) -> datetime:
    """Convert a UTC or naive timestamp into the company's IANA timezone."""
    aware = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
    return aware.astimezone(ZoneInfo(tz_name))


def get_company_today(app_now: datetime, tz_name: str) -> date:
    """Return the calendar date of app_now in the company's timezone."""
    return to_company_tz(app_now, tz_name).date()


def get_week_start(local_date: date) -> date:
    """Return the Monday date (week_start) for a given calendar date."""
    return local_date - timedelta(days=local_date.weekday())


def get_13_week_starts(app_now: datetime, tz_name: str) -> list[date]:
    """Return the last 13 Monday week_starts ending with the current week."""
    today = get_company_today(app_now, tz_name)
    current_week = get_week_start(today)
    return [current_week - timedelta(weeks=12 - offset) for offset in range(13)]


def get_quarter_label(local_date: date) -> str:
    """Return calendar quarter label formatted as YYYY-Q#."""
    quarter = (local_date.month - 1) // 3 + 1
    return f"{local_date.year}-Q{quarter}"
