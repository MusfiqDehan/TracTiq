# TracTiq — Architecture & Domain Diagrams

This document catalogs the system architecture, low-level execution pipeline, EOS weekly workflow, and PostgreSQL schema for **TracTiq**. Every diagram below is rendered inline via **Mermaid**.

| # | Diagram                                                                                | Scope                                                                                                                            |
| :- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| 1 | [High-Level Design (HLD)](#1-high-level-design-hld)                                     | Containers, Next.js frontend, FastAPI backend, WebSocket pub/sub, CLI jobs, and PostgreSQL 18.7                                  |
| 2 | [Low-Level Design (LLD)](#2-low-level-design-lld)                                       | RBAC dependency chain, optimistic concurrency, zero-duplicate upsert, transactional `EventBus`, and `RealtimeHub` loops      |
| 3 | [EOS Domain &amp; Scoring Workflow](#3-eos-domain--weekly-scoring-workflow)             | Weekly `America/Chicago` Scorecard rules, `Make it an Issue` links, Issues/To-Dos/Rocks loop, and 75-minute Level 10 Meeting |
| 4 | [Database Entity-Relationship (ER) Diagram](#4-database-entity-relationship-er-diagram) | All 13 tenant-scoped PostgreSQL tables, primary/foreign keys, partial unique indexes, and DB triggers                            |

---

## 1. High-Level Design (HLD)

Shows the three-container runtime topology (`frontend :3003`, `backend :8003`, `db :5443`), dual-protocol client communication (authenticated REST with `ETag`/`If-Match` + `< 1s` WebSocket sync), deterministic `APP_NOW` vs. monotonic meeting timer separation, and unattended CLI entrypoints (`seed-db` and `rules-report`).

```mermaid
flowchart TB
    classDef client fill:#FFFFFF,stroke:#1B4332,color:#141514,font-weight:bold
    classDef fe fill:#EAF2EE,stroke:#1B4332,color:#1B4332,font-weight:bold
    classDef be fill:#1B4332,stroke:#143326,color:#F7F7F5,font-weight:bold
    classDef core fill:#EFEFEC,stroke:#B4B7AE,color:#141514
    classDef db fill:#ECFDF3,stroke:#16A34A,color:#15803D,font-weight:bold
    classDef cli fill:#FFFBEB,stroke:#D97706,color:#B45309,font-weight:bold

    subgraph CLIENTS["Multi-User Browser Clients"]
        B1["Facilitator / Team Member Browser (Admin or Member - R/W)"]:::client
        B2["Teammate / Observer Browser (Observer - Read-Only Live Sync)"]:::client
    end

    subgraph FRONTEND["Frontend Container - Next.js 16.4.6 App Router (Bun :3003)"]
        SHELL["Adaptive AppShell + Urbanist Design System (Light and Dark Themes)"]:::fe
        PAGES["Routes: / Directory | /teams/[teamId] | /teams/[teamId]/meeting"]:::fe
        SHARED["Shared Domain UI: ScorecardSection | IssuesSection | Todos | Rocks | AuditDrawer"]:::fe
        STATE["State Layer: AuthProvider (JWT) + TanStack Query v5 Cache"]:::core
        NET["Transport Clients: apiRequest (REST + If-Match ETag + Auto Refresh) | useTeamRealtime (WS)"]:::core

        SHELL --> PAGES --> SHARED --> STATE --> NET
    end

    subgraph BACKEND["Backend Container - FastAPI 0.165.0 Async Server (Python 3.14 / uv :8003)"]
        MW["Edge Middleware: CORSMiddleware + RequestIDMiddleware + Global Error Handler"]:::core
        AUTHZ["Zero-Trust Security Gate: HS256 JWT + Team Membership (404) + Writer Guard (403)"]:::be
        MODULES["Domain Modules: auth | teams | scorecard | issues | todos | rocks | meetings | audit"]:::be
        CLOCK["Dual Clock Engine: APP_NOW (America/Chicago Business Rules) + Monotonic Timer (ms)"]:::core
        BUS["Transactional EventBus (Stages AuditLog + pg_notify in Single DB Commit)"]:::core
        HUB["RealtimeHub: Team WebSocket Registry + 1s Timer Loop + LISTEN Fan-Out"]:::be

        MW --> AUTHZ --> MODULES
        MODULES --> CLOCK
        MODULES --> BUS
        HUB <--> BUS
    end

    subgraph CLI_TOOLS["Unattended CLI Jobs (Backend Container)"]
        SEED["uv run alembic upgrade head && uv run seed-db (Idempotent Seed Loader)"]:::cli
        REPORT["uv run rules-report (Read-Only Deterministic JSON Rules Engine)"]:::cli
    end

    subgraph DATABASE["Database Container - PostgreSQL 18.7 (:5443)"]
        PG_TABLES["13 Tenant-Scoped Tables (company_id Isolation via TenantRepository)"]:::db
        PG_RULES["Integrity Layer: Partial Unique Indexes + CHECKs + Non-Observer DB Trigger"]:::db
        PG_PUBSUB["PostgreSQL LISTEN / NOTIFY Channel ('tractiq_realtime') + JSONB Snapshots"]:::db

        PG_TABLES --- PG_RULES --- PG_PUBSUB
    end

    B1 -- "HTTPS / UI Actions" --> SHELL
    B2 -- "HTTPS / Read-Only UI" --> SHELL
    NET -- "REST JSON (/api/* + Bearer JWT + If-Match)" --> MW
    NET <== "WebSocket (/api/ws/teams/{id}?token=JWT) <1s Sync" ==> HUB

    MODULES -- "Async SQLAlchemy 2.0 (psycopg3)" --> PG_TABLES
    BUS -- "Atomic AuditLog INSERT + pg_notify" --> PG_PUBSUB
    PG_PUBSUB == "Async LISTEN Stream" ==> HUB

    SEED -- "Schema + seed.json" --> PG_TABLES
    REPORT -- "Computes §2.6 Rules at APP_NOW" --> PG_TABLES
```

---

## 2. Low-Level Design (LLD)

Traces how an incoming REST mutation or WebSocket connection flows through FastAPI's authorization dependency chain (`core/deps.py`), concurrency-safe service logic (`If-Match` optimistic locking + `ON CONFLICT DO NOTHING` atomic deduplication), `TenantRepository` scoping, single-transaction `AuditLog` + `pg_notify` staging (`core/events.py`), and `RealtimeHub` (`meetings/realtime.py`) WebSocket state recovery (`MEETING_SNAPSHOT`, `DOMAIN_EVENT`, and `1.0s` `TIMER_TICK`).

```mermaid
flowchart TB
    classDef entry fill:#EAF2EE,stroke:#1B4332,color:#1B4332,font-weight:bold
    classDef guard fill:#FFFBEB,stroke:#D97706,color:#B45309,font-weight:bold
    classDef svc fill:#1B4332,stroke:#143326,color:#F7F7F5,font-weight:bold
    classDef tx fill:#FFFFFF,stroke:#D4D5CE,color:#141514
    classDef pg fill:#ECFDF3,stroke:#16A34A,color:#15803D,font-weight:bold
    classDef ws fill:#EFEFEC,stroke:#1B4332,color:#141514,font-weight:bold

    subgraph INGRESS["1. API & WebSocket Ingress"]
        REQ["REST Request (/api/teams/{team_id}/*)"]:::entry
        WS_IN["WS Connect (/api/ws/teams/{team_id}?token=JWT)"]:::entry
    end

    subgraph DEPS["2. Auth & RBAC Dependency Chain (core/deps.py)"]
        D1["get_current_user: Verify HS256 Access JWT -> 401 if invalid"]:::guard
        D2["get_authorized_team: Verify company_id + Membership (Admin bypass) -> 404 TEAM_NOT_FOUND"]:::guard
        D3["require_team_writer: Reject Observer mutations -> 403 OBSERVER_READ_ONLY"]:::guard
        D4["validate_owner_eligible: Non-Observer + Team Member/Admin -> 422 VALIDATION_ERROR"]:::guard

        D1 --> D2 --> D3 --> D4
    end

    subgraph SERVICES["3. Domain Services & Concurrency Control"]
        S_SCORE["scorecard.upsert_score: If-Match ETag check (409 Conflict) OR Last-Save-Wins Upsert"]:::svc
        S_MAKE["issues.make_issue_from_source: INSERT .. ON CONFLICT DO NOTHING (201 New vs 200 Existing)"]:::svc
        S_IDS["issues.solve_issue & add_todo_from_issue: Required Note + Due Date (APP_NOW + 7d)"]:::svc
        S_MEET["meetings.service: Facilitator-Only Advance/End + Freeze summary_snapshot JSONB"]:::svc
        S_RULE["rules_report.service: America/Chicago Mon-Sun Weeks + Decimal ROUND_HALF_UP"]:::tx
    end

    subgraph TX_BUS["4. Atomic DB Transaction & EventBus (core/events.py)"]
        REPO["TenantRepository[T]: Enforces WHERE company_id = ctx.company.id"]:::tx
        STAGE["event_bus.stage_in_tx(): 1) INSERT AuditLog  2) SELECT pg_notify('tractiq_realtime')"]:::tx
        COMMIT["AsyncSession.commit(): Atomically persists Entity + AuditLog + Fires NOTIFY"]:::pg
    end

    subgraph PG_ENGINE["5. PostgreSQL 18.7 Constraints & Indexes"]
        IDX1["uq_scores_measurable_week + Monday ISODOW=1 CHECK"]:::pg
        IDX2["3 Partial Unique Indexes (WHERE solved_at IS NULL) on Measurable+Week, Rock, Todo"]:::pg
        IDX3["uq_meetings_one_active_per_team (WHERE status='active')"]:::pg
        TRG["BEFORE INSERT/UPDATE Trigger: fn_enforce_non_observer_and_team_member()"]:::pg
    end

    subgraph REALTIME["6. RealtimeHub & Client Recovery (meetings/realtime.py)"]
        SNAP["On WS Connect: Register Attendance + Send Immediate MEETING_SNAPSHOT"]:::ws
        LISTEN["_postgres_listen_loop(): Receives NOTIFY -> Broadcasts DOMAIN_EVENT to Team Sockets"]:::ws
        TICK["_meeting_timer_loop(): Every 1.0s computes Monotonic Remaining / Overtime -> TIMER_TICK"]:::ws
        RQ["Frontend useTeamRealtime: Updates Live Timer + Invalidates TanStack Query Keys"]:::entry
    end

    REQ --> D1
    WS_IN --> D1
    WS_IN --> SNAP

    D3 --> S_SCORE & S_MAKE & S_IDS & S_MEET
    D4 --> S_IDS
    S_SCORE & S_MAKE & S_IDS & S_MEET --> S_RULE
    S_SCORE & S_MAKE & S_IDS & S_MEET --> REPO --> STAGE --> COMMIT

    COMMIT --> IDX1 & IDX2 & IDX3 & TRG
    COMMIT == "Post-Commit NOTIFY" ==> LISTEN
    SNAP & LISTEN & TICK ==> RQ
```

---

## 3. EOS Domain & Weekly Scoring Workflow

Illustrates the repeating weekly **Measure → Commit → Resolve** loop: how weekly Measurable scores evaluate to `On Track`, `Off Track`, or `Pending` across all four goal types (`at_least`, `at_most`, `between`, `exactly`), how off-track Scorecard cells, off-track Rocks, and overdue To-Dos escalate into deduplicated **Issues**, how solving Issues spawns `+7 day` **To-Dos**, and how the 75-minute **Level 10 Meeting** (`Scorecard 5m → IDS 60m → Conclude 10m`) reuses the workspace modules and freezes an immutable summary snapshot.

```mermaid
flowchart TD
    classDef brand fill:#1B4332,stroke:#143326,color:#F7F7F5,font-weight:bold
    classDef surface fill:#FFFFFF,stroke:#D4D5CE,color:#141514
    classDef subtle fill:#EFEFEC,stroke:#B4B7AE,color:#141514
    classDef ontrack fill:#ECFDF3,stroke:#16A34A,color:#15803D,font-weight:bold
    classDef offtrack fill:#FEF2F2,stroke:#DC2626,color:#B91C1C,font-weight:bold
    classDef pending fill:#FFFBEB,stroke:#D97706,color:#B45309,font-weight:bold
    classDef meeting fill:#EAF2EE,stroke:#1B4332,color:#1B4332,font-weight:bold

    subgraph RBAC["1. Users, Roles & Team Access (Server-Enforced)"]
        U_ADMIN["Admin (All teams - R/W, Own, Facilitate, Rate)"]:::brand
        U_MEM["Team Member (Own teams - R/W, Own, Facilitate, Rate)"]:::surface
        U_OBS["Observer (Own teams - Read-Only, Join L10 Only)"]:::pending
    end

    subgraph SCORECARD["2. MEASURE: 13-Week Scorecard (Mon-Sun America/Chicago)"]
        M_DEF["Measurable (Owner, Unit, Goal: at_least | at_most | between | exactly)"]:::surface
        S_INPUT["Weekly Score Cell (Numeric 18,4 - Inline Edit with ETag / Last-Save-Wins)"]:::surface
        S_DEC{"Score present?"}:::subtle
        S_WEEK{"Is Current Week?"}:::subtle
        S_GOAL{"Meets Goal? (Boundaries Inclusive)"}:::subtle
        ST_PEND["PENDING (Current week, no score yet)"]:::pending
        ST_ON["ON TRACK (Goal met)"]:::ontrack
        ST_OFF["OFF TRACK (Goal missed OR closed week empty)"]:::offtrack

        M_DEF --> S_INPUT --> S_DEC
        S_DEC -- "No" --> S_WEEK
        S_WEEK -- "Yes" --> ST_PEND
        S_WEEK -- "No (Closed Week)" --> ST_OFF
        S_DEC -- "Yes" --> S_GOAL
        S_GOAL -- "Yes" --> ST_ON
        S_GOAL -- "No" --> ST_OFF
    end

    subgraph COMMIT["3. COMMIT: Quarterly Rocks & Weekly To-Dos"]
        ROCK["Quarterly Rock (Read-Only - Progress = Done / Total Milestones %)"]:::surface
        ROCK_OFF["Off-Track Rock (Seeded Off-Track OR Milestone Past Due)"]:::offtrack
        TODO["7-Day To-Do (Due = Today + 7d, Target >= 90% Last Closed Week)"]:::surface
        TODO_OVER["Overdue To-Do (Not done & due_date < today)"]:::offtrack

        ROCK --> ROCK_OFF
        TODO --> TODO_OVER
    end

    subgraph RESOLVE["4. RESOLVE: Issues Queue (Strict Issue Order)"]
        ISS_LIST["Unsolved Issues (Priority 5 -> 1, Oldest First, No Priority Last)"]:::brand
        ISS_SOLVE["Solved Issues Archive (Requires Non-Blank Resolution Note)"]:::ontrack
    end

    subgraph L10["5. LIVE LEVEL 10 MEETING (75m - Server Timer & WS <1s)"]
        L10_START["Facilitator Starts L10 (1 Active Meeting / Team)"]:::brand
        L10_S1["Section 1: Scorecard (5m) - Review Last Closed Week"]:::meeting
        L10_S2["Section 2: IDS (60m) - Identify, Discuss, Solve"]:::meeting
        L10_S3["Section 3: Conclude (10m) - Recap New To-Dos & 1-10 Ratings"]:::meeting
        L10_END["End Meeting -> Immutable summary_snapshot (JSONB) + Audit Trail"]:::brand

        L10_START --> L10_S1 -- "Facilitator Advances (Overrun = Over Time)" --> L10_S2 -- "Facilitator Advances" --> L10_S3 -- "Facilitator Ends" --> L10_END
    end

    U_ADMIN --> SCORECARD
    U_MEM --> SCORECARD
    U_OBS -. "Read-only view & join L10" .-> L10_START

    ST_OFF -- "Core: Make it an Issue (1 unsolved / measurable+week)" --> ISS_LIST
    ROCK_OFF -. "Bonus: Make it an Issue (1 unsolved / rock)" .-> ISS_LIST
    TODO_OVER -. "Bonus: Make it an Issue (1 unsolved / todo)" .-> ISS_LIST

    ISS_LIST -- "Add To-Do (+7 days, Admin/Member Owner)" --> TODO
    ISS_LIST -- "Solve (Note Required)" --> ISS_SOLVE

    SCORECARD -. "Reused in Step 1" .-> L10_S1
    ISS_LIST -. "Reused in Step 2" .-> L10_S2
    TODO -. "Created in L10 Recapped" .-> L10_S3
```

---

## 4. Database Entity-Relationship (ER) Diagram

Documents all 13 PostgreSQL tables defined in `backend/alembic/versions/0001_initial_schema.py`, including `company_id` tenant scoping, explicit source-linking foreign keys (`source_measurable_id` + `source_week_start`, `source_rock_id`, `source_todo_id`, `source_issue_id`), partial unique indexes preventing duplicate unsolved Issues and concurrent active meetings, `CHECK` constraints, and the `fn_enforce_non_observer_and_team_member` database trigger.

```mermaid
erDiagram
    companies ||--o{ teams : "owns (company_id)"
    companies ||--o{ users : "employs (company_id)"
    teams ||--o{ memberships : "has members"
    users ||--o{ memberships : "belongs to"

    teams ||--o{ measurables : "tracks weekly"
    users ||--o{ measurables : "owns (non-observer)"
    measurables ||--o{ scores : "weekly values"

    teams ||--o{ rocks : "commits quarterly"
    users ||--o{ rocks : "owns (non-observer)"
    rocks ||--o{ milestones : "breaks into"

    teams ||--o{ issues : "tracks problems"
    users ||--o{ issues : "owns (non-observer)"
    measurables ||--o{ issues : "source_measurable_id + week_start"
    rocks ||--o{ issues : "source_rock_id (bonus)"
    todos ||--o{ issues : "source_todo_id (bonus)"

    teams ||--o{ todos : "tracks 7-day tasks"
    users ||--o{ todos : "owns (non-observer)"
    issues ||--o{ todos : "spawns (source_issue_id)"

    teams ||--o{ meetings : "runs L10 (1 active)"
    users ||--o{ meetings : "facilitates (non-observer)"
    meetings ||--o{ meeting_attendees : "tracks presence"
    users ||--o{ meeting_attendees : "attends (incl. observer)"
    meetings ||--o{ meeting_ratings : "collects 1-10"
    users ||--o{ meeting_ratings : "rates (non-observer)"
    meetings ||--o{ issues : "solved_in_meeting_id"
    meetings ||--o{ todos : "created_in_meeting_id"

    teams ||--o{ audit_logs : "records history"
    users ||--o{ audit_logs : "actor_id"

    companies {
        varchar id PK "co_1"
        varchar name
        varchar timezone "America/Chicago"
        timestamptz created_at
    }

    teams {
        varchar id PK "team_lead, team_sales, team_ops"
        varchar company_id FK
        varchar name
    }

    users {
        varchar id PK "u1..u9"
        varchar company_id FK
        varchar name
        varchar email UK
        varchar role "admin | team_member | observer"
    }

    memberships {
        varchar user_id PK,FK
        varchar team_id PK,FK
        varchar company_id FK
    }

    measurables {
        varchar id PK "m1..m7"
        varchar company_id FK
        varchar team_id FK
        varchar owner_id FK
        varchar name
        varchar unit "count | % | hours | $k"
        varchar goal_type "at_least | at_most | between | exactly"
        numeric goal_value "Numeric(18,4)"
        numeric goal_min "Numeric(18,4)"
        numeric goal_max "Numeric(18,4)"
    }

    scores {
        varchar id PK
        varchar company_id FK
        varchar measurable_id FK "UQ with week_start"
        date week_start "Monday ISO weekday=1"
        numeric value "Numeric(18,4)"
        int version "Optimistic lock >=1"
        timestamptz updated_at
    }

    rocks {
        varchar id PK "r1..r7"
        varchar company_id FK
        varchar team_id FK
        varchar owner_id FK
        varchar title
        varchar quarter "2026-Q4"
        varchar status "on_track | off_track | complete"
    }

    milestones {
        varchar id PK "ms1..ms12"
        varchar company_id FK
        varchar rock_id FK
        varchar title
        date due_date
        boolean done
    }

    issues {
        varchar id PK "i1..i9"
        varchar company_id FK
        varchar team_id FK
        varchar owner_id FK
        varchar title
        int priority "NULL or 1..5"
        timestamptz created_at
        timestamptz solved_at
        text resolution_note "Required when solved"
        varchar source_measurable_id FK "Partial UQ unsolved"
        date source_week_start "Paired w/ measurable"
        varchar source_rock_id FK "Partial UQ unsolved"
        varchar source_todo_id FK "Partial UQ unsolved"
        varchar solved_in_meeting_id FK
        int version "Optimistic lock >=1"
    }

    todos {
        varchar id PK "t1..t41"
        varchar company_id FK
        varchar team_id FK
        varchar owner_id FK
        varchar title
        date due_date "Created +7 days"
        timestamptz done_at
        varchar source_issue_id FK
        varchar created_in_meeting_id FK
        timestamptz created_at
    }

    meetings {
        varchar id PK "mt1..mt2+"
        varchar company_id FK
        varchar team_id FK "Partial UQ active"
        varchar facilitator_id FK
        varchar status "active | ended"
        varchar current_section "scorecard | ids | conclude | ended"
        timestamptz section_started_at
        bigint section_started_monotonic_ms
        timestamptz started_at
        timestamptz ended_at
        jsonb summary_snapshot "Frozen on end"
    }

    meeting_attendees {
        varchar meeting_id PK,FK
        varchar user_id PK,FK
        varchar company_id FK
        timestamptz joined_at
    }

    meeting_ratings {
        varchar meeting_id PK,FK
        varchar user_id PK,FK
        varchar company_id FK
        int rating "CHECK 1..10"
        timestamptz updated_at
    }

    audit_logs {
        varchar id PK
        varchar company_id FK
        varchar team_id FK
        varchar actor_id FK
        varchar action "ScoreUpdated, IssueSolved..."
        varchar entity_type "score | issue | todo | meeting"
        varchar entity_id
        jsonb before_state
        jsonb after_state
        timestamptz created_at
    }
```
