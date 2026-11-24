import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_openapi_schema_and_audit_cursor_pagination(client: AsyncClient) -> None:
    schema_res = await client.get("/openapi.json")
    assert schema_res.status_code == 200
    openapi = schema_res.json()
    paths = openapi["paths"]

    expected_paths = [
        "/api/auth/users",
        "/api/auth/switch",
        "/api/auth/refresh",
        "/api/auth/me",
        "/api/teams",
        "/api/teams/{team_id}/overview",
        "/api/teams/{team_id}/scorecard",
        "/api/teams/{team_id}/measurables/{measurable_id}/scores/{week_start}",
        "/api/teams/{team_id}/issues",
        "/api/teams/{team_id}/issues/make-issue",
        "/api/teams/{team_id}/issues/{issue_id}/solve",
        "/api/teams/{team_id}/issues/{issue_id}/todos",
        "/api/teams/{team_id}/todos",
        "/api/teams/{team_id}/rocks",
        "/api/teams/{team_id}/meetings/start",
        "/api/meetings/{meeting_id}/advance",
        "/api/meetings/{meeting_id}/end",
        "/api/meetings/{meeting_id}/summary",
        "/api/teams/{team_id}/audit-logs",
    ]
    for path in expected_paths:
        assert path in paths

    # Create 3 mutations to verify transactional audit trail + cursor pagination
    await client.post(
        "/api/teams/team_lead/issues",
        json={"title": "Audit test 1", "priority": 2},
        headers=auth_headers("u2"),
    )
    await client.post(
        "/api/teams/team_lead/issues",
        json={"title": "Audit test 2", "priority": 3},
        headers=auth_headers("u2"),
    )
    await client.post(
        "/api/teams/team_lead/issues",
        json={"title": "Audit test 3", "priority": 4},
        headers=auth_headers("u2"),
    )

    page1 = await client.get(
        "/api/teams/team_lead/audit-logs?limit=2", headers=auth_headers("u2")
    )
    assert page1.status_code == 200
    body1 = page1.json()
    assert len(body1["data"]) == 2
    assert body1["meta"]["has_more"] is True
    assert body1["meta"]["next_cursor"] is not None

    page2 = await client.get(
        f"/api/teams/team_lead/audit-logs?limit=2&cursor={body1['meta']['next_cursor']}",
        headers=auth_headers("u2"),
    )
    assert page2.status_code == 200
    assert len(page2.json()["data"]) >= 1
