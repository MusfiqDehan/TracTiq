import base64
import json
from typing import Any

from app.core.errors import AppError


def encode_cursor(payload: dict[str, Any]) -> str:
    """Encode pagination cursor dict into an opaque URL-safe string."""
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> dict[str, Any]:
    """Decode an opaque cursor string or raise 422 VALIDATION_ERROR."""
    try:
        padding = "=" * (-len(cursor) % 4)
        decoded = base64.urlsafe_b64decode(cursor + padding).decode("utf-8")
        data = json.loads(decoded)
        if not isinstance(data, dict):
            raise ValueError("Cursor payload must be an object")
        return data
    except Exception as exc:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Invalid pagination cursor.",
            [{"field": "cursor", "message": "Malformed cursor"}],
        ) from exc
