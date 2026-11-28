<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/logo-wordmark-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="frontend/public/logo-wordmark.svg" />
  <img src="frontend/public/logo-wordmark.svg" alt="TracTiq — EOS L10" height="52" />
</picture>

<h1>EOS Level 10 Meeting &amp; Team Operating System</h1>

<p>
  Full-stack, real-time EOS Level 10 Meeting and Team Management application with live Scorecards, Q4 Rocks &amp; Milestones, IDS issue solving, To-Dos, and WebSocket-synchronized meeting facilitation.
</p>

<p>
  <img src="./.github/badges/nextjs.svg" alt="Next.js 16.4.6" />
  <img src="./.github/badges/react.svg" alt="React 19.3.1" />
  <img src="./.github/badges/typescript.svg" alt="TypeScript 6.0.3" />
  <img src="./.github/badges/tailwindcss.svg" alt="Tailwind CSS 4.3.5" />
  <img src="./.github/badges/bun.svg" alt="Bun 1.4.4" />
</p>

<p>
  <img src="./.github/badges/fastapi.svg" alt="FastAPI 0.165.0" />
  <img src="./.github/badges/python.svg" alt="Python 3.14.10" />
  <img src="./.github/badges/uv.svg" alt="uv 0.13.5" />
  <img src="./.github/badges/postgresql.svg" alt="PostgreSQL 18.7" />
  <img src="./.github/badges/sqlalchemy.svg" alt="SQLAlchemy 2.1.9" />
  <img src="./.github/badges/docker.svg" alt="Docker 29.10.1" />
</p>

<p>
  <strong>Frontend:</strong> <code>:3003</code> (<code>bun</code>) &nbsp;&middot;&nbsp;
  <strong>Backend API:</strong> <code>:8003</code> (<code>uv</code>) &nbsp;&middot;&nbsp;
  <strong>PostgreSQL:</strong> <code>:5443</code>
</p>

<p>
  <a href="#quick-start">Quick Start</a> &nbsp;&bull;&nbsp;
  <a href="#rules-report-command">Rules Report</a> &nbsp;&bull;&nbsp;
  <a href="#running-all-tests">Tests</a> &nbsp;&bull;&nbsp;
  <a href="#architecture-tradeoffs--known-limitations">Architecture</a> &nbsp;&bull;&nbsp;
  <a href="#core-journey">Core Journey</a>
</p>

</div>

---

## Quick Start

```bash
docker compose up -d --build
```

- **Frontend:** http://localhost:3003
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

The default report output is committed in [rules_report.json](./rules_report.json).

## Running All Tests

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

Committed Playwright failure artifacts:

- Trace archive: [frontend/e2e/artifacts/sample-failure-trace.zip](./frontend/e2e/artifacts/sample-failure-trace.zip)
- Side-by-side failure video: [frontend/e2e/artifacts/sample-failure-video.mp4](./frontend/e2e/artifacts/sample-failure-video.mp4)
- Root cause, timeline & handling docs: [frontend/e2e/artifacts/README.md](./frontend/e2e/artifacts/README.md)

## Fixture & Clock Strategy

- **Domain Clock (`APP_NOW`):** All business calculations (13-week trailing Scorecard in `America/Chicago`, overdue To-Dos, past-due Milestones, To-Do 7-day due dates, and meeting timestamps) read `APP_NOW` dynamically via `app.core.clock.get_app_now()`. Rounding uses `decimal.Decimal` with `ROUND_HALF_UP`.
- **Live Section Timer Separation:** Active meeting countdown/overtime ticks use a separate monotonic epoch millisecond anchor (`section_started_monotonic_ms`) so the 1-second WebSocket timer runs smoothly even when `APP_NOW` is frozen for deterministic testing.
- **Deterministic Test Isolation:** Backend `pytest` fixtures call `seed_database(session, reset=True)` before every test and dispose async connection pools per loop. Playwright E2E resets state via `POST /api/test/reset` (active only when `APP_ENV=test`) or `uv run seed-db --reset`.

## Architecture, Tradeoffs & Known Limitations

- See [DECISION_RECORD.md](./DECISION_RECORD.md) for data model, API, WebSocket state recovery, concurrency deduplication, immutable meeting summary snapshots, and 1,000-company scaling tradeoffs.
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

- **Antigravity AI Assistant (Planning & Execution Agents):** Used for multi-lens architectural brainstorming (`/egm-brainstorm`), planning or fine-tune planning (`/plan`+`/grill-me`), seed boundary forensics verification, modular FastAPI/SQLAlchemy/Next.js scaffolding, Alembic migration and constraint generation, and unit/integration/Playwright test implementation. All business rules, database constraints, and generated code were verified directly against `seed.json` and executed tests.
