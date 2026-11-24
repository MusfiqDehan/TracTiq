import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_audit_logs_return_human_readable_fields_for_all_events(
    client: AsyncClient,
) -> None:
    headers = auth_headers("u2")  # Blake Brooks

    # 1. Create Issue
    create_issue_res = await client.post(
        "/api/teams/team_lead/issues",
        json={"title": "Warehouse backlog rising", "priority": 3},
        headers=headers,
    )
    assert create_issue_res.status_code == 201
    issue_id = create_issue_res.json()["data"]["id"]

    # 2. Update Issue Priority
    patch_issue_res = await client.patch(
        f"/api/teams/team_lead/issues/{issue_id}",
        json={"priority": 1},
        headers=headers,
    )
    assert patch_issue_res.status_code == 200

    # 3. Create To-Do from Issue
    create_todo_res = await client.post(
        f"/api/teams/team_lead/issues/{issue_id}/todos",
        json={"title": "Audit shift schedule", "owner_id": "u3"},
        headers=headers,
    )
    assert create_todo_res.status_code == 201
    todo_id = create_todo_res.json()["data"]["id"]

    # 4. Toggle To-Do done and reopened
    done_res = await client.patch(
        f"/api/teams/team_lead/todos/{todo_id}",
        json={"done": True},
        headers=headers,
    )
    assert done_res.status_code == 200

    reopen_res = await client.patch(
        f"/api/teams/team_lead/todos/{todo_id}",
        json={"done": False},
        headers=headers,
    )
    assert reopen_res.status_code == 200

    # 5. Solve Issue
    solve_res = await client.post(
        f"/api/teams/team_lead/issues/{issue_id}/solve",
        json={"resolution_note": "Added second shift crew"},
        headers=headers,
    )
    assert solve_res.status_code == 200

    # 6. Update an existing Scorecard score (m2 = Customer churn, %, 2026-11-02 was 3.0)
    score_res = await client.put(
        "/api/teams/team_lead/measurables/m2/scores/2026-11-02",
        json={"value": 2.4},
        headers=headers,
    )
    assert score_res.status_code == 200

    # 7. Start, advance, rate, and end a Level 10 Meeting
    start_res = await client.post("/api/teams/team_lead/meetings/start", headers=headers)
    assert start_res.status_code == 201
    meeting_id = start_res.json()["data"]["id"]

    adv1_res = await client.post(f"/api/meetings/{meeting_id}/advance", headers=headers)
    assert adv1_res.status_code == 200
    adv2_res = await client.post(f"/api/meetings/{meeting_id}/advance", headers=headers)
    assert adv2_res.status_code == 200

    rate_res = await client.post(
        f"/api/meetings/{meeting_id}/rate",
        json={"rating": 9},
        headers=headers,
    )
    assert rate_res.status_code == 200

    end_res = await client.post(f"/api/meetings/{meeting_id}/end", headers=headers)
    assert end_res.status_code == 200

    # Fetch audit logs and verify human-readable summaries & details
    audit_res = await client.get(
        "/api/teams/team_lead/audit-logs?limit=30",
        headers=headers,
    )
    assert audit_res.status_code == 200
    entries = audit_res.json()["data"]
    by_action = {}
    for item in entries:
        by_action.setdefault(item["action"], []).append(item)

    # IssueCreated
    created_issue = by_action["IssueCreated"][0]
    assert created_issue["action_label"] == "Created Issue"
    assert created_issue["entity_label"] == "Warehouse backlog rising"
    assert created_issue["summary"] == 'Blake Brooks created issue "Warehouse backlog rising".'
    assert {"label": "Priority", "value": "#3", "before": None, "after": None} in created_issue["details"]

    # IssuePriorityUpdated resolves Issue title from DB
    prio_updated = by_action["IssuePriorityUpdated"][0]
    assert prio_updated["action_label"] == "Updated Priority"
    assert prio_updated["entity_label"] == "Warehouse backlog rising"
    assert (
        prio_updated["summary"]
        == 'Blake Brooks changed priority on "Warehouse backlog rising" from #3 to #1.'
    )
    assert prio_updated["details"] == [
        {"label": "Priority", "value": None, "before": "#3", "after": "#1"}
    ]

    # IssueSolved resolves Issue title + resolution note
    solved_issue = by_action["IssueSolved"][0]
    assert solved_issue["action_label"] == "Solved Issue"
    assert solved_issue["entity_label"] == "Warehouse backlog rising"
    assert solved_issue["summary"] == 'Blake Brooks solved issue "Warehouse backlog rising".'
    assert {
        "label": "Resolution",
        "value": "Added second shift crew",
        "before": None,
        "after": None,
    } in solved_issue["details"]

    # TodoCreated
    created_todo = by_action["TodoCreated"][0]
    assert created_todo["action_label"] == "Created To-Do"
    assert created_todo["entity_label"] == "Audit shift schedule"
    assert created_todo["summary"] == 'Blake Brooks created To-Do "Audit shift schedule".'
    assert {"label": "Owner", "value": "Casey Cho", "before": None, "after": None} in created_todo["details"]

    # TodoToggled (both events share frozen APP_NOW, so match by action_label)
    toggles_by_label = {item["action_label"]: item for item in by_action["TodoToggled"]}
    assert set(toggles_by_label.keys()) == {"Completed To-Do", "Reopened To-Do"}
    assert (
        toggles_by_label["Reopened To-Do"]["summary"]
        == 'Blake Brooks reopened To-Do "Audit shift schedule".'
    )
    assert toggles_by_label["Reopened To-Do"]["details"] == [
        {"label": "Status", "value": None, "before": "Completed", "after": "Open"}
    ]
    assert (
        toggles_by_label["Completed To-Do"]["summary"]
        == 'Blake Brooks marked To-Do "Audit shift schedule" as completed.'
    )
    assert toggles_by_label["Completed To-Do"]["details"] == [
        {"label": "Status", "value": None, "before": "Open", "after": "Completed"}
    ]

    # ScoreUpdated resolves Measurable name + unit formatting
    score_entry = by_action["ScoreUpdated"][0]
    assert score_entry["action_label"] == "Updated Score"
    assert score_entry["entity_label"] == "Customer churn"
    assert (
        score_entry["summary"]
        == 'Blake Brooks updated "Customer churn" for week of Nov 2 from 3% to 2.4%.'
    )
    assert score_entry["details"] == [
        {"label": "Week", "value": "Week of Nov 2", "before": None, "after": None},
        {"label": "Score", "value": None, "before": "3%", "after": "2.4%"},
        {"label": "Status", "value": "On Track", "before": None, "after": None},
    ]

    # Meeting lifecycle
    assert by_action["MeetingStarted"][0]["summary"] == "Blake Brooks started a Level 10 Meeting."
    advance_summaries = {item["summary"] for item in by_action["MeetingSectionAdvanced"]}
    assert advance_summaries == {
        "Blake Brooks moved the Level 10 Meeting from Scorecard to IDS.",
        "Blake Brooks moved the Level 10 Meeting from IDS to Conclude.",
    }
    assert by_action["MeetingRated"][0]["summary"] == "Blake Brooks rated the Level 10 Meeting 9 / 10."
    assert (
        by_action["MeetingEnded"][0]["summary"]
        == "Blake Brooks ended the Level 10 Meeting with an average rating of 9 / 10."
    )
