from datetime import datetime
from typing import Any

from fastapi import Request
from pydantic import BaseModel, Field

from app.core.clock import get_app_now


class ResponseMeta(BaseModel):
    request_id: str
    timestamp: datetime
    next_cursor: str | None = None
    has_more: bool = False


class ApiResponse[T](BaseModel):
    """Standardized REST response envelope across all endpoints."""

    data: T
    meta: ResponseMeta


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | dict[str, Any] = Field(default_factory=list)
    request_id: str


class ApiErrorResponse(BaseModel):
    """Standardized REST error envelope across all endpoints."""

    error: ErrorBody


def make_response[T](
    data: T,
    request: Request,
    *,
    next_cursor: str | None = None,
    has_more: bool = False,
) -> ApiResponse[T]:
    """Construct a typed ApiResponse with request metadata."""
    request_id = getattr(request.state, "request_id", "unknown")
    return ApiResponse(
        data=data,
        meta=ResponseMeta(
            request_id=request_id,
            timestamp=get_app_now(),
            next_cursor=next_cursor,
            has_more=has_more,
        ),
    )
