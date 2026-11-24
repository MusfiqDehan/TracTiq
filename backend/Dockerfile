FROM python:3.14.10-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /uvx /bin/

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY backend/pyproject.toml /app/pyproject.toml
COPY backend/app /app/app
RUN uv sync --no-dev

COPY backend/alembic.ini /app/alembic.ini
COPY backend/alembic /app/alembic
COPY backend/tests /app/tests
COPY seed.json /app/seed.json

RUN uv sync

ENV UV_NO_SYNC=1

EXPOSE 8003

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
