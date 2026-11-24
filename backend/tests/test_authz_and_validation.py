import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from starlette.testclient import TestClient

from app.core.database import get_sync_session_factory
from app.main import app
from tests.conftest import auth_headers, mint_jwt


@pytest.mark.asyncio
async def test_unauthenticated_access_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/teams/team_lead/overview")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_jwt_switch_and_refresh_flow(client: AsyncClient) -> None:
    sw = await client.post("/api/auth/switch", json={"user_id": "u2"})
    assert sw.status_code == 200
    data = sw.json()["data"]
    assert data["user"]["id"] == "u2"
    assert [t["id"] for t in data["user"]["teams"]] == ["team_lead", "team_sales"]

    rf = await client.post("/api/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert rf.status_code == 200
    new_access = rf.json()["data"]["access_token"]

    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200
    assert me.json()["data"]["id"] == "u2"


@pytest.mark.asyncio
async def test_cross_team_access_refused_even_by_guessed_id(client: AsyncClient) -> None:
    # u2 belongs to team_lead and team_sales, NOT team_ops
    res_get = await client.get("/api/teams/team_ops/overview", headers=auth_headers("u2"))
    assert res_get.status_code == 404
    assert res_get.json()["error"]["code"] == "TEAM_NOT_FOUND"

    res_put = await client.put(
        "/api/teams/team_ops/measurables/m7/scores/2026-11-09",
        json={"value": 1},
        headers=auth_headers("u2"),
    )
    assert res_put.status_code == 404

    # Admin u1 can access all teams including team_ops
    res_admin = await client.get("/api/teams/team_ops/overview", headers=auth_headers("u1"))
    assert res_admin.status_code == 200

    # Cross-team ended meeting summary access by guessed ID refused with 404
    # u6 belongs to team_sales only, NOT team_lead where mt1 ran
    res_mt = await client.get("/api/meetings/mt1/summary", headers=auth_headers("u6"))
    assert res_mt.status_code == 404
    assert res_mt.json()["error"]["code"] == "TEAM_NOT_FOUND"

    # Admin u1 can read mt1 summary
    res_mt_admin = await client.get("/api/meetings/mt1/summary", headers=auth_headers("u1"))
    assert res_mt_admin.status_code == 200


@pytest.mark.asyncio
async def test_observer_cannot_write_start_facilitate_or_rate(client: AsyncClient) -> None:
    # u5 is observer in team_lead -> can read
    read_res = await client.get("/api/teams/team_lead/overview", headers=auth_headers("u5"))
    assert read_res.status_code == 200
    assert read_res.json()["data"]["team"]["can_write"] is False

    # Observer write attempts all refused with 403
    assert (
        await client.put(
            "/api/teams/team_lead/measurables/m1/scores/2026-11-09",
            json={"value": 15},
            headers=auth_headers("u5"),
        )
    ).status_code == 403

    assert (
        await client.post(
            "/api/teams/team_lead/issues",
            json={"title": "Observer issue", "priority": 3},
            headers=auth_headers("u5"),
        )
    ).status_code == 403

    assert (
        await client.post(
            "/api/teams/team_lead/issues/i1/solve",
            json={"resolution_note": "Nope"},
            headers=auth_headers("u5"),
        )
    ).status_code == 403

    assert (
        await client.patch(
            "/api/teams/team_lead/todos/t30",
            json={"done": True},
            headers=auth_headers("u5"),
        )
    ).status_code == 403

    assert (
        await client.post(
            "/api/teams/team_lead/meetings/start",
            headers=auth_headers("u5"),
        )
    ).status_code == 403

    # Start meeting as u2; u5 can join, cannot rate or advance or end
    start = await client.post("/api/teams/team_lead/meetings/start", headers=auth_headers("u2"))
    assert start.status_code == 201
    mt_id = start.json()["data"]["id"]

    join_obs = await client.post(f"/api/meetings/{mt_id}/join", headers=auth_headers("u5"))
    assert join_obs.status_code == 200
    assert any(a["user_id"] == "u5" for a in join_obs.json()["data"]["attendees"])

    assert (
        await client.post(f"/api/meetings/{mt_id}/rate", json={"rating": 8}, headers=auth_headers("u5"))
    ).status_code == 403
    assert (
        await client.post(f"/api/meetings/{mt_id}/advance", headers=auth_headers("u5"))
    ).status_code == 403
    assert (
        await client.post(f"/api/meetings/{mt_id}/end", headers=auth_headers("u5"))
    ).status_code == 403

    # Non-facilitator team member u3 also cannot advance or end
    assert (
        await client.post(f"/api/meetings/{mt_id}/advance", headers=auth_headers("u3"))
    ).status_code == 403
    assert (
        await client.post(f"/api/meetings/{mt_id}/end", headers=auth_headers("u3"))
    ).status_code == 403


@pytest.mark.asyncio
async def test_validation_and_db_constraints(client: AsyncClient) -> None:
    # Eligible owners list never includes Observers
    team_res = await client.get("/api/teams/team_lead", headers=auth_headers("u2"))
    owner_ids = [o["id"] for o in team_res.json()["data"]["eligible_owners"]]
    assert "u5" not in owner_ids
    assert "u7" not in owner_ids

    # Assigning Observer u5 as To-Do owner -> 422
    todo_obs = await client.post(
        "/api/teams/team_lead/issues/i1/todos",
        json={"title": "Invalid owner todo", "owner_id": "u5"},
        headers=auth_headers("u2"),
    )
    assert todo_obs.status_code == 422

    # Solving Issue with blank note -> 422
    blank_solve = await client.post(
        "/api/teams/team_lead/issues/i1/solve",
        json={"resolution_note": "   "},
        headers=auth_headers("u2"),
    )
    assert blank_solve.status_code == 422

    # Non-Monday score date -> 422
    bad_monday = await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-10",
        json={"value": 11},
        headers=auth_headers("u2"),
    )
    assert bad_monday.status_code == 422

    # Non-finite or out-of-range numeric score -> 422
    bad_nan = await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-09",
        json={"value": "NaN"},
        headers=auth_headers("u2"),
    )
    assert bad_nan.status_code == 422

    bad_overflow = await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-09",
        json={"value": "1000000000000000"},
        headers=auth_headers("u2"),
    )
    assert bad_overflow.status_code == 422

    # Rating before the Conclude section -> 422
    mt_start = await client.post("/api/teams/team_lead/meetings/start", headers=auth_headers("u2"))
    assert mt_start.status_code == 201
    mt_id = mt_start.json()["data"]["id"]
    early_rate = await client.post(
        f"/api/meetings/{mt_id}/rate",
        json={"rating": 9},
        headers=auth_headers("u2"),
    )
    assert early_rate.status_code == 422
    assert early_rate.json()["error"]["code"] == "VALIDATION_ERROR"

    # DB trigger directly blocks Observer ownership even bypassing API
    with get_sync_session_factory()() as session:
        with pytest.raises(IntegrityError):
            session.execute(
                text(
                    "INSERT INTO issues (id, company_id, team_id, title, owner_id, priority, created_at, version) "
                    "VALUES ('i_bad', 'co_1', 'team_lead', 'Bad', 'u5', 1, NOW(), 1)"
                )
            )
            session.commit()
        session.rollback()


def test_websocket_snapshot_and_realtime_event_sync() -> None:
    with TestClient(app) as sync_client:
        u2_headers = auth_headers("u2")
        start = sync_client.post("/api/teams/team_lead/meetings/start", headers=u2_headers)
        assert start.status_code == 201
        mt_id = start.json()["data"]["id"]

        token_u5 = mint_jwt("u5")
        with sync_client.websocket_connect(f"/api/ws/teams/team_lead?token={token_u5}") as ws:
            snap = ws.receive_json()
            assert snap["type"] == "MEETING_SNAPSHOT"
            assert snap["meeting"]["id"] == mt_id
            assert snap["meeting"]["current_section"] == "scorecard"
            assert any(a["user_id"] == "u5" for a in snap["meeting"]["attendees"])

            adv = sync_client.post(f"/api/meetings/{mt_id}/advance", headers=u2_headers)
            assert adv.status_code == 200

            msg = ws.receive_json()
            while msg["type"] == "TIMER_TICK":
                msg = ws.receive_json()
            assert msg["type"] == "DOMAIN_EVENT"
            assert msg["event_type"] == "MeetingSectionAdvanced"
            assert msg["payload"]["meeting"]["current_section"] == "ids"
