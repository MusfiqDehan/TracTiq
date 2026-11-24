from decimal import Decimal

from app.core.errors import AppError


def parse_expected_version(
    if_match: str | None, expected_version: int | None
) -> int | None:
    """Resolve optional optimistic concurrency version from expected_version or If-Match ETag."""
    if expected_version is not None:
        if expected_version < 0:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "expected_version must be non-negative.",
                [{"field": "expected_version", "message": "Must be >= 0"}],
            )
        return expected_version

    if if_match is None:
        return None
    raw = if_match.strip()
    if not raw or raw == "*":
        return None

    if raw.startswith(("W/", "w/")):
        raw = raw[2:].strip()
    if len(raw) >= 2 and raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1].strip()

    try:
        parsed = int(raw)
    except ValueError as exc:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Malformed If-Match ETag header.",
            [{"field": "If-Match", "message": "Expected integer or W/\"<version>\""}],
        ) from exc

    if parsed < 0:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "ETag version must be non-negative.",
            [{"field": "If-Match", "message": "Must be >= 0"}],
        )
    return parsed


def decimal_to_number(value: Decimal) -> int | float:
    """Convert Decimal to clean JSON int or float without precision artifacts."""
    if value == value.to_integral_value():
        return int(value)
    return float(value)
