# TracTiq — EOS Level 10 Meeting & Team Operating System

Full-stack, real-time EOS Level 10 Meeting and Team Management application built with **Next.js 16.4.6** (`bun`, port `3003`), **FastAPI 0.165.0** (`uv`, Python `3.14.10`, port `8003`), and **PostgreSQL 18.7** (port `5443`).

## Quick Start (`docker compose up`)

```bash
docker compose up -d --build
```

- **Frontend:** http://localhost:3003 (Executive Landing Page, Team Workspace `/teams/team_lead`, Level 10 Meeting `/teams/team_lead/meeting`)
- **Backend OpenAPI / Swagger:** http://localhost:8003/docs
- **PostgreSQL 18.7:** `localhost:5443` (`postgres` / `postgres` / `tractiq`)

On startup, the backend runs `alembic upgrade head`, idempotently loads `seed.json` via `uv run seed-db`, and starts Uvicorn on port `8003`.

## Rules Report Command

Zero-auth, strictly read-only JSON report driven by `APP_NOW` (default `2026-11-11T15:00:00Z`):

```bash
# Via Docker Compose against freshly seeded DB:
docker compose run --rm backend uv run rules-report

# At another date (example across DST boundary):
docker compose run --rm -e APP_NOW=2026-11-01T07:30:00Z backend uv run rules-report
```

The default report output is committed in [rules_report.json](file:///home/musfiq/Products/TracTiq/rules_report.json).

## Running All Tests (Unattended)

Run the full verification suite (backend `ruff` + `mypy` + `pytest` rules/authz/concurrency/OpenAPI suites + golden `rules_report.json` check + frontend `tsc` + `eslint` + `vitest` + two-browser Playwright E2E sync test):

```bash
./scripts/verify-all.sh
```

Or run individual test layers:

```bash
# Backend rules, RBAC, concurrency, and WebSocket tests
cd backend && uv run pytest -v

# Frontend unit/component tests
cd frontend && bun run test:unit

# Two-browser Playwright real-time sync E2E test
cd frontend && bun run test:e2e
```

Committed Playwright failure trace artifact: [frontend/e2e/artifacts/sample-failure-trace.zip](file:///home/musfiq/Products/TracTiq/frontend/e2e/artifacts/sample-failure-trace.zip).

## Fixture & Clock Strategy

- **Domain Clock (`APP_NOW`):** All business calculations (13-week trailing Scorecard in `America/Chicago`, overdue To-Dos, past-due Milestones, To-Do 7-day due dates, and meeting timestamps) read `APP_NOW` dynamically via `app.core.clock.get_app_now()`. Rounding uses `decimal.Decimal` with `ROUND_HALF_UP`.
- **Live Section Timer Separation:** Active meeting countdown/overtime ticks use a separate monotonic epoch millisecond anchor (`section_started_monotonic_ms`) so the 1-second WebSocket timer runs smoothly even when `APP_NOW` is frozen for deterministic testing.
- **Deterministic Test Isolation:** Backend `pytest` fixtures call `seed_database(session, reset=True)` before every test and dispose async connection pools per loop. Playwright E2E resets state via `POST /api/test/reset` (active only when `APP_ENV=test`) or `uv run seed-db --reset`.

## Architecture, Tradeoffs & Known Limitations

- See [DECISION_RECORD.md](file:///home/musfiq/Products/TracTiq/DECISION_RECORD.md) for data model, API, WebSocket state recovery, concurrency deduplication, immutable meeting summary snapshots, and 1,000-company scaling tradeoffs.
- **Assumptions & Limitations:**
  - Seeded users switch via zero-password `POST /api/auth/switch` minting real HS256 JWT access/refresh tokens (signup/passwords are out of scope).
  - Cross-team/unauthorized team access returns `404 TEAM_NOT_FOUND` to avoid leaking team ID existence; role violations (`observer`, non-facilitator) return `403`.
  - Cursor pagination is enabled on Solved Issues, To-Dos, and Audit Logs, while the 13-week Scorecard and active Unsolved IDS list return complete team sets for live re-ordering.
  - `If-Match` / `ETag` optimistic locking protects Scores and Issue priorities when provided and falls back to last-save-wins when omitted.

## Core Journey

1. Open http://localhost:3003, switch to **Blake Brooks** (`u2`, Team Member) and **Ellis Evans** (`u5`, Observer) in two browser windows, and navigate to **Leadership** (`/teams/team_lead`).
2. Update last closed week scores inline, toggle To-Dos, and review Q4 Rocks & Milestones (and bonus **Make it an Issue** on off-track Rocks / overdue To-Dos).
3. Start the **Level 10 Meeting** as `u2`; `u5` joins live in read-only mode. Advance **Scorecard (5m)** → **IDS (60m)** (solve an Issue, add a 7-day To-Do) → **Conclude (10m)** (recap new To-Dos, submit 1–10 ratings) → **End Meeting** to view the frozen **Meeting Summary**.

## AI Tools Disclosure

- **Antigravity AI Assistant (Planning & Execution Agents):** Used for multi-lens architectural brainstorming (`/egm-brainstorm`), seed boundary forensics verification, modular FastAPI/SQLAlchemy/Next.js scaffolding, Alembic migration and constraint generation, and unit/integration/Playwright test implementation. All business rules, database constraints, and generated code were verified directly against `seed.json` and executed tests.
