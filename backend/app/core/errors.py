import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.responses import ApiErrorResponse, ErrorBody


class AppError(Exception):
    """Domain or HTTP exception rendered in the standard ApiErrorResponse envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details: list[dict[str, Any]] | dict[str, Any] = (
            details if details is not None else []
        )


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a correlation request_id to every request state and response header."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


def _build_error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: list[dict[str, Any]] | dict[str, Any] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    payload = ApiErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            details=details if details is not None else [],
            request_id=request_id,
        )
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


def register_exception_handlers(app: FastAPI) -> None:
    """Register uniform exception handlers across the FastAPI application."""

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return _build_error_response(
            request, exc.status_code, exc.code, exc.message, exc.details
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ())),
                "message": err.get("msg", "Invalid input"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()
        ]
        return _build_error_response(
            request,
            422,
            "VALIDATION_ERROR",
            "Request validation failed",
            details,
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        code_map = {
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
        }
        code = code_map.get(exc.status_code, "HTTP_ERROR")
        return _build_error_response(request, exc.status_code, code, str(exc.detail))

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        msg = str(exc.orig) if exc.orig else str(exc)
        if "uq_meetings_one_active_per_team" in msg:
            return _build_error_response(
                request,
                409,
                "CONFLICT_ACTIVE_MEETING",
                "An active meeting already exists for this team.",
            )
        return _build_error_response(
            request,
            422,
            "DB_CONSTRAINT_VIOLATION",
            "Database constraint rejected the operation.",
            {"detail": msg},
        )
