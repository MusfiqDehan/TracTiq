from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import dispose_engines
from app.core.errors import RequestIDMiddleware, register_exception_handlers
from app.core.events import event_bus
from app.db import models_registry as _models_registry  # noqa: F401
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.issues.router import router as issues_router
from app.modules.meetings.realtime import realtime_hub
from app.modules.meetings.router import router as meetings_router
from app.modules.rocks.router import router as rocks_router
from app.modules.scorecard.router import router as scorecard_router
from app.modules.teams.router import router as teams_router
from app.modules.testing.router import router as testing_router
from app.modules.todos.router import router as todos_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    event_bus.subscribe_realtime(realtime_hub.handle_domain_event)
    await realtime_hub.start_background_tasks()
    try:
        yield
    finally:
        await realtime_hub.stop_background_tasks()
        await dispose_engines()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="TracTiq API",
        version="0.1.0",
        description="EOS Level 10 Meeting & Team Management Platform REST & WebSocket API",
        lifespan=lifespan,
    )

    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["ETag", "X-Request-Id"],
    )
    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings.APP_ENV}

    app.include_router(auth_router)
    app.include_router(teams_router)
    app.include_router(scorecard_router)
    app.include_router(issues_router)
    app.include_router(todos_router)
    app.include_router(rocks_router)
    app.include_router(meetings_router)
    app.include_router(audit_router)

    if settings.APP_ENV == "test":
        app.include_router(testing_router)

    return app


app: FastAPI = create_app()
