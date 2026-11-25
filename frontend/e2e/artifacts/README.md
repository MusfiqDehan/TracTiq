# Playwright E2E Failure Trace & Video Artifacts

This directory contains committed Playwright failure artifacts captured against the current TracTiq full-stack build (`Next.js 16.4.6`, `FastAPI`, `PostgreSQL 18.7`, redesigned AppShell UI with top-right toast notifications).

## Artifacts

| File | Description |
| :--- | :--- |
| [sample-failure-trace.zip](./sample-failure-trace.zip) | Full two-browser Playwright Trace (`@playwright/test`, Chromium `1280×720`) containing before/after DOM snapshots, action timeline, network & WebSocket logs, console output, failure screenshots, and exact error call stack for both browser contexts. |
| [sample-failure-video.mp4](./sample-failure-video.mp4) | Side-by-side H.264 MP4 recording (`1924×630`, ~12s) showing **Facilitator (`u2` — Blake Brooks)** on the left and **Observer (`u5` — Ellis Evans)** on the right, synchronized frame-for-frame through the live Level 10 Meeting transition and failure banner. |

## How to Inspect

```bash
# Open the interactive Playwright Trace Viewer locally
cd frontend && bunx playwright show-trace e2e/artifacts/sample-failure-trace.zip
```

You can also drag and drop `sample-failure-trace.zip` into <https://trace.playwright.dev> or open `sample-failure-video.mp4` directly in any browser or media player.

---

## Failure Scenario — What Happened & When It Failed

- **Captured Against:** Full Docker Compose stack (`http://localhost:3003` + `http://localhost:8003` + PostgreSQL 18.7)
- **Clock & Seed Baseline:** Deterministic seed state (`APP_NOW=2026-11-11T15:00:00Z`) reset via `uv run seed-db --reset` / `POST /api/test/reset`
- **Browser Contexts:**
  - **Context 1 (Facilitator):** Blake Brooks (`u2`, `team_member`) at `/teams/team_lead/meeting?as=u2`
  - **Context 2 (Observer):** Ellis Evans (`u5`, `observer`) at `/teams/team_lead/meeting?as=u5`

### Execution Timeline

1. **Meeting Start (`Scorecard 5m`):** Facilitator `u2` clicks `Start L10 Meeting` (`start-meeting-btn`). Both browser contexts transition to **Scorecard (5m)** in real time via WebSocket and display the live server-owned countdown timer (`meeting-timer`).
2. **Make It an Issue (Scorecard → Issue):** Facilitator `u2` flags off-track Scorecard cell `(m1, 2026-10-26)` (`make-issue-m1-2026-10-26`). The top-right toast confirms `"Issue created from Scorecard"`.
3. **Real-Time Section Advance (`Scorecard → IDS 60m`):** Facilitator `u2` clicks `Advance to IDS` (`advance-section-btn`). Observer `u5` follows the transition to **IDS (60m)** automatically without reloading and sees `"New deals closed – 2026-10-26"` appear live in the Unsolved Issues list (`Unsolved (6)`).
4. **Failure Point (Observer Attempts Facilitator Action):**
   The test asserts that the **Observer** context (`u5`) can see and use the facilitator-only `advance-section-btn`:
   ```ts
   await expect(observerPage.getByTestId("advance-section-btn")).toBeVisible({
     timeout: 2000,
   });
   ```
   Playwright waits `2000ms` and fails with:
   ```text
   Error: expect(locator).toBeVisible() failed
   Locator: getByTestId('advance-section-btn')
   Expected: visible
   Timeout: 2000ms
   Error: element(s) not found
   ```

---

## Why It Failed (Root Cause)

This failure reproduces what happens when an E2E test or client flow expects a facilitator/write control inside a read-only **Observer** session (for example, due to a mistaken assertion, persona mismatch, or leaked session state).

TracTiq enforces RBAC and facilitator-only meeting controls across **three layers**:

1. **UI Layer (`frontend/src/features/meetings/components/MeetingWorkspace.tsx`):**
   - `canWrite` is `false` for `observer` users, and `isFacilitator` is `false` for anyone other than the active meeting facilitator (`Blake Brooks`).
   - Instead of rendering `advance-section-btn` (`Advance to Conclude`) or `end-meeting-btn` (`End Meeting`), the Observer's meeting header displays `"Only Blake Brooks can advance or end"`.
   - Likewise, Issue mutation buttons (`Add To-Do`, `Solve`, priority dropdown changes) are omitted on the Observer's screen.
2. **API Layer (`backend/app/core/authz.py` & `backend/app/modules/meetings/`):**
   - Even if an Observer or non-facilitator crafts a direct REST request to advance/end a meeting or mutate team entities, the backend rejects it with `403 Forbidden`.
3. **Database Layer (`PostgreSQL` trigger):**
   - The `BEFORE INSERT OR UPDATE` trigger `fn_enforce_non_observer_and_team_member` blocks Observer ownership, meeting facilitation, and ratings at the database layer.

---

## How We Handle & Prevent This Failure

### 1. Explicit RBAC Assertions & Isolated Contexts in E2E Tests
In [frontend/e2e/meeting-sync.spec.ts](../meeting-sync.spec.ts):
- Facilitator (`u2`) and Observer (`u5`) always run in **separate `browser.newContext()` instances** so JWT tokens and local state cannot leak across personas.
- Positive write assertions run exclusively on `facilitatorPage`, while `observerPage` explicitly verifies **read-only enforcement**:
  ```ts
  await expect(observerPage.getByTestId("advance-section-btn")).toHaveCount(0);
  await expect(observerPage.getByTestId("end-meeting-btn")).toHaveCount(0);
  ```
- Before every test run, `resetSeedState()` restores a clean seeded database via `POST /api/test/reset` (or `uv run seed-db --reset`), eliminating cross-run state drift.

### 2. Automatic Failure Forensics via Playwright Config
In [frontend/playwright.config.ts](../../playwright.config.ts):
- `trace: "retain-on-failure"` and `screenshot: "only-on-failure"` automatically capture full traces and screenshots whenever a test fails in CI or locally.
- Opening the trace lets an engineer verify in seconds:
  - **Network tab:** `/api/auth/switch` and `/api/auth/me` confirm the failing context is authenticated as `u5` (`role: "observer"`), while WebSocket frames confirm real-time sync succeeded (`IDS 60m`, `Unsolved (6)`).
  - **DOM Snapshot:** Visually contrasts `Facilitator` (`Advance to Conclude` + `End Meeting` visible) against `Observer` (`Only Blake Brooks can advance or end`), immediately distinguishing an RBAC/persona error from a WebSocket sync failure or missing UI element.

### 3. Defense-in-Depth Test Coverage
Alongside the passing two-browser Playwright E2E suite (`cd frontend && bun run test:e2e`), backend `pytest` suites verify `403` Observer rejections, `404` cross-team isolation, concurrent `"Make it an Issue"` deduplication, and database constraint enforcement.
