import asyncio

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_concurrent_make_issue_returns_single_issue(client: AsyncClient) -> None:
    # 1. Existing seeded unsolved issue i5 on (m1, 2026-11-02) must be returned cleanly
    res_seeded = await client.post(
        "/api/teams/team_lead/issues/make-issue",
        json={"measurable_id": "m1", "week_start": "2026-11-02"},
        headers=auth_headers("u2"),
    )
    assert res_seeded.status_code == 200
    assert res_seeded.json()["data"]["created"] is False
    assert res_seeded.json()["data"]["issue"]["id"] == "i5"

    # 2. 10 concurrent Make-it-an-Issue calls on an off-track cell without an existing Issue (m1, 2026-10-26)
    async def fire(user_id: str):
        return await client.post(
            "/api/teams/team_lead/issues/make-issue",
            json={"measurable_id": "m1", "week_start": "2026-10-26"},
            headers=auth_headers(user_id),
        )

    responses = await asyncio.gather(*(fire("u2" if idx % 2 == 0 else "u3") for idx in range(10)))
    assert all(r.status_code in (200, 201) for r in responses)
    created_flags = [r.json()["data"]["created"] for r in responses]
    issue_ids = {r.json()["data"]["issue"]["id"] for r in responses}
    assert created_flags.count(True) == 1
    assert len(issue_ids) == 1

    # 3. Bonus: concurrent Make-it-an-Issue on off-track Rock r2 -> single Issue
    rock_responses = await asyncio.gather(
        *(
            client.post(
                "/api/teams/team_lead/issues/make-issue",
                json={"rock_id": "r2"},
                headers=auth_headers("u2"),
            )
            for _ in range(5)
        )
    )
    assert {r.json()["data"]["issue"]["id"] for r in rock_responses}.__len__() == 1

    # 4. Bonus: concurrent Make-it-an-Issue on overdue To-Do t12 -> single Issue
    todo_responses = await asyncio.gather(
        *(
            client.post(
                "/api/teams/team_lead/issues/make-issue",
                json={"todo_id": "t12"},
                headers=auth_headers("u4"),
            )
            for _ in range(5)
        )
    )
    assert {r.json()["data"]["issue"]["id"] for r in todo_responses}.__len__() == 1


@pytest.mark.asyncio
async def test_optimistic_concurrency_if_match_vs_last_save_wins(client: AsyncClient) -> None:
    # Score m1 / 2026-11-02 starts at version 1
    r1 = await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-02",
        json={"value": 15},
        headers={**auth_headers("u2"), "If-Match": 'W/"1"'},
    )
    assert r1.status_code == 200
    assert r1.headers["etag"] == 'W/"2"'

    # Stale If-Match W/"1" must return 409 Conflict
    stale = await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-02",
        json={"value": 20},
        headers={**auth_headers("u3"), "If-Match": 'W/"1"'},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "CONFLICT_STALE_VERSION"

    # Omitting If-Match MUST succeed as last-save-wins (core spec)
    lsw = await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-02",
        json={"value": 22},
        headers=auth_headers("u4"),
    )
    assert lsw.status_code == 200
    assert lsw.json()["data"]["value"] == 22
    assert lsw.json()["data"]["version"] == 3


@pytest.mark.asyncio
async def test_one_active_meeting_and_ended_summary_immutability(client: AsyncClient) -> None:
    s1 = await client.post("/api/teams/team_lead/meetings/start", headers=auth_headers("u2"))
    assert s1.status_code == 201
    mt_id = s1.json()["data"]["id"]

    # Second concurrent start rejected with 409
    s2 = await client.post("/api/teams/team_lead/meetings/start", headers=auth_headers("u3"))
    assert s2.status_code == 409

    # Advance through IDS and Conclude, solve i1, add todo, rate 9, end meeting
    await client.post(f"/api/meetings/{mt_id}/advance", headers=auth_headers("u2"))
    await client.post(
        "/api/teams/team_lead/issues/i1/solve",
        json={"resolution_note": "Resolved in meeting"},
        headers=auth_headers("u2"),
    )
    await client.post(
        "/api/teams/team_lead/issues/i1/todos",
        json={"title": "Follow up hiring", "owner_id": "u3"},
        headers=auth_headers("u2"),
    )
    await client.post(f"/api/meetings/{mt_id}/advance", headers=auth_headers("u2"))
    await client.post(f"/api/meetings/{mt_id}/rate", json={"rating": 9}, headers=auth_headers("u2"))
    ended = await client.post(f"/api/meetings/{mt_id}/end", headers=auth_headers("u2"))
    assert ended.status_code == 200
    summary_before = ended.json()["data"]
    assert summary_before["rating"] == 9.0
    assert "i1" in summary_before["issues_solved"]

    # Later edit to m1 score on scorecard_week (2026-11-02) must NOT change frozen summary
    await client.put(
        "/api/teams/team_lead/measurables/m1/scores/2026-11-02",
        json={"value": 99},
        headers=auth_headers("u2"),
    )
    summary_after = (
        await client.get(f"/api/meetings/{mt_id}/summary", headers=auth_headers("u2"))
    ).json()["data"]
    assert summary_after["measurable_status"]["m1"] == summary_before["measurable_status"]["m1"] == "off_track"
