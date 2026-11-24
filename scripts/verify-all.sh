#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== 1. Ensuring PostgreSQL 18.7 is healthy ==="
docker compose stop backend frontend >/dev/null 2>&1 || true
docker compose up -d db
until docker compose exec -T db pg_isready -U postgres -d tractiq >/dev/null 2>&1; do
  sleep 1
done

echo "=== 2. Running Backend Migrations, Seed, Lint, Typecheck & Pytest ==="
cd "$ROOT_DIR/backend"
uv run alembic upgrade head
uv run seed-db --reset
uv run ruff check .
uv run mypy app
uv run pytest -v

echo "=== 3. Verifying Read-Only Rules Report Matches Committed Golden JSON ==="
uv run seed-db --reset
uv run rules-report > /tmp/tractiq_rules_report_check.json
diff -u "$ROOT_DIR/rules_report.json" /tmp/tractiq_rules_report_check.json

echo "=== 4. Running Frontend Typecheck, Lint, Unit Tests & Build ==="
cd "$ROOT_DIR/frontend"
bun run typecheck
bun run lint
bun run test:unit
bun run build

echo "=== 5. Starting Full Compose Stack & Running Two-Browser Playwright E2E ==="
cd "$ROOT_DIR"
docker compose up -d --build
until curl -sf http://localhost:8003/health >/dev/null 2>&1; do
  sleep 1
done
until curl -sf http://localhost:3003 >/dev/null 2>&1; do
  sleep 1
done

cd "$ROOT_DIR/frontend"
bun run test:e2e

echo "=== 6. Restoring Clean Seeded State ==="
cd "$ROOT_DIR/backend"
uv run seed-db --reset

echo "=== ALL CHECKS PASSED ==="
