# Architecture Decision Record: TracTiq (EOS L10)

## 1. Data Model & Source Linking
- **Tenant & Core Entities:** Every tenant-owned table (`teams`, `users`, `memberships`, `measurables`, `scores`, `rocks`, `milestones`, `issues`, `todos`, `meetings`, `meeting_attendees`, `meeting_ratings`, `audit_logs`) carries `company_id` and preserves exact string primary keys (`co_1`, `team_lead`, `u1`..`u9`, `m1`..`m7`, `r1`..`r7`, `ms1`..`ms12`, `i1`..`i9`, `t1`..`t41`, `mt1`..`mt2`).
- **Issue Source Linking:** Rather than a polymorphic `(source_type, source_id)` string pair without foreign keys, `issues` uses explicit nullable FK columns (`source_measurable_id`, `source_week_start`, `source_rock_id`, `source_todo_id`) constrained by `CHECK (num_nonnulls(source_measurable_id, source_rock_id, source_todo_id) <= 1)` and `CHECK ((source_measurable_id IS NULL) = (source_week_start IS NULL))`. To-Dos link back to Issues via `source_issue_id REFERENCES issues(id)`.
- **Database Integrity:** PostgreSQL enforces `CHECK` constraints (goal shapes, Monday `EXTRACT(ISODOW FROM week_start) = 1`, priority `1..5`, rating `1..10`, non-blank resolution note when solved) plus a `BEFORE INSERT OR UPDATE` trigger (`fn_enforce_non_observer_and_team_member`) rejecting Observer ownership, facilitation, or rating at the DB layer.
- **Tradeoff:** Adding a new Issue source type requires an Alembic migration for a new nullable FK and partial index, trading schema agility for strict referential integrity and DB-level deduplication.

## 2. API Design
- **Modular REST + OpenAPI:** Endpoints are partitioned by domain module under `/api/{auth,teams,scorecard,issues,todos,rocks,meetings,audit}` and documented via FastAPI's OpenAPI schema. Every response uses `ApiResponse[T]` (`{data, meta}`) and errors use `ApiErrorResponse` (`{error: {code, message, details, request_id}}`).
- **Predictable Security & Concurrency Semantics:** Cross-team access or unknown team IDs return `404 TEAM_NOT_FOUND` (preventing team ID enumeration). Observer writes and non-facilitator meeting controls return `403`. Invalid inputs (such as assigning an Observer as owner) return `422`.
- **Opt-In Lost-Update Protection:** Scores and Issues expose an integer `version` and `ETag: W/"<version>"`. Clients sending `If-Match` receive `409 Conflict` on stale writes; clients omitting `If-Match` execute standard **last-save-wins**, ensuring full compatibility with core spec callers.

## 3. Real-Time Transport, Meeting State & Recovery
- **Transport:** FastAPI WebSockets (`/api/ws/teams/{team_id}?token=<jwt>`) backed by an `EventBus` that stages transactional `AuditLog` entries and PostgreSQL `SELECT pg_notify('tractiq_realtime', ...)` inside the database commit, fanning out across all backend workers via `LISTEN tractiq_realtime`.
- **Server-Owned State & Timer:** The database stores `status`, `current_section` (`scorecard` 5m → `ids` 60m → `conclude` 10m → `ended`), `section_started_at`, and `section_started_monotonic_ms`. A 1-second server loop broadcasts `TIMER_TICK` (`remaining_seconds`, `is_overtime`, `overtime_seconds`) and never auto-advances overrun sections.
- **Recovery:** On WebSocket connect (late join, browser refresh, or reconnect), the server registers attendance and immediately sends `MEETING_SNAPSHOT` before subscribing the socket to live `DOMAIN_EVENT` and `TIMER_TICK` frames.
- **Tradeoff:** WebSockets require stateful connection management and pub/sub coordination compared to short polling, chosen to guarantee `< 1s` cross-browser sync and immediate presence recovery.

## 4. Concurrency-Safe "Make it an Issue"
- **Partial Unique Indexes:** Three partial unique indexes on `issues` (`WHERE solved_at IS NULL`) enforce at-most-one unsolved Issue per `(team_id, source_measurable_id, source_week_start)`, `(team_id, source_rock_id)`, and `(team_id, source_todo_id)`.
- **Atomic Upsert:** `POST /api/teams/{team_id}/issues/make-issue` runs `INSERT INTO issues ... ON CONFLICT DO NOTHING RETURNING *`. Under simultaneous clicks, PostgreSQL MVCC serializes conflicting inserts: one request inserts (`201 Created`) while concurrent callers receive no row on conflict and immediately `SELECT` the committed unsolved Issue (`200 OK`).
- **Tradeoff:** Offloads synchronization entirely to PostgreSQL's index engine without fragile application-level distributed locks.

## 5. Immutable Past Meeting Summaries
- **Snapshot-on-End:** When the facilitator calls `POST /api/meetings/{id}/end`, the server computes `scorecard_week` measurable statuses, solved Issues, created To-Dos, attendees, and `ROUND_HALF_UP` average rating, and writes them into `meetings.summary_snapshot` (`JSONB`). Subsequent edits to scores, issues, or to-dos never mutate `summary_snapshot`. Seeded historical meetings (`mt1`, `mt2`) keep `summary_snapshot = NULL` so `uv run rules-report` computes their summaries dynamically at any `APP_NOW`.
- **Tradeoff:** Duplicates ~2 KB of summary JSON per ended meeting in exchange for O(1) immutable historical reads.

## 6. Bonus Note: Scaling to 1,000 Companies
1. **Database Isolation & Pooling:** Every domain table already partitions cleanly by indexed `company_id` via `TenantRepository`. At 1,000 companies (~10k+ teams), add PostgreSQL Row-Level Security (`CREATE POLICY tenant_isolation ... USING (company_id = current_setting('app.company_id'))`) as defense-in-depth and deploy PgBouncer in transaction-pooling mode.
2. **Real-Time Pub/Sub:** Replace the single Postgres `LISTEN/NOTIFY` channel behind `RealtimeHub` with Redis Pub/Sub sharded by `company_id:team_id`, keeping WebSocket gateways horizontally stateless behind a load balancer.
3. **Partitioning & Read Replicas:** Partition `audit_logs` and historical `scores` by `created_at` / `week_start` (or hash-partition by `company_id`), and route read-heavy `overview` and `rules_report` queries to read replicas.
