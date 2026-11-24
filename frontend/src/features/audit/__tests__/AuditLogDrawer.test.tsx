import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogDrawer } from "../components/AuditLogDrawer";
import { formatAuditEntry } from "../format-audit";
import * as apiClient from "@/lib/api-client";
import type { AuditLogRead } from "@/lib/types";

const sampleLogs: AuditLogRead[] = [
  {
    id: "aud_1",
    team_id: "team_lead",
    actor_id: "u2",
    actor_name: "Blake Brooks",
    action: "ScoreUpdated",
    action_label: "Updated Score",
    entity_type: "score",
    entity_id: "sc_m2_2026-11-02",
    entity_label: "Customer churn",
    summary: 'Blake Brooks updated "Customer churn" for week of Nov 2 from 3% to 2.5%.',
    details: [
      { label: "Week", value: "Week of Nov 2" },
      { label: "Score", before: "3%", after: "2.5%" },
      { label: "Status", value: "On Track" },
    ],
    before_state: { value: 3.0, version: 1 },
    after_state: {
      measurable_id: "m2",
      week_start: "2026-11-02",
      value: 2.5,
      version: 2,
      status: "on_track",
    },
    created_at: "2026-11-11T15:10:00Z",
  },
  {
    id: "aud_2",
    team_id: "team_lead",
    actor_id: "u2",
    actor_name: "Blake Brooks",
    action: "IssuePriorityUpdated",
    entity_type: "issue",
    entity_id: "iss_999",
    before_state: { priority: 4, version: 1 },
    after_state: { priority: 1, version: 2 },
    created_at: "2026-11-11T15:05:00Z",
  },
];

describe("AuditLogDrawer & formatAuditEntry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders human-readable audit trail cards without raw JSON blocks", async () => {
    vi.spyOn(apiClient, "apiRequest").mockResolvedValue({
      data: sampleLogs,
      meta: {
        request_id: "req_1",
        timestamp: "2026-11-11T15:11:00Z",
        next_cursor: null,
        has_more: false,
      },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <AuditLogDrawer teamId="team_lead" open={true} onClose={() => {}} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Blake Brooks updated "Customer churn" for week of Nov 2 from 3% to 2.5%.')
      ).toBeInTheDocument();
    });

    // Backend-enriched score update
    expect(screen.getByText("Updated Score")).toBeInTheDocument();
    expect(screen.getByText("Week of Nov 2")).toBeInTheDocument();
    expect(screen.getByText("3%")).toBeInTheDocument();
    expect(screen.getByText("2.5%")).toBeInTheDocument();
    expect(screen.getByText("On Track")).toBeInTheDocument();

    // Client-side fallback formatting when backend enrichment fields are absent
    expect(screen.getByText("Updated Priority")).toBeInTheDocument();
    expect(
      screen.getByText("Blake Brooks changed issue priority from #4 to #1.")
    ).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();

    // Ensure no raw JSON <pre> blocks or raw internal identifiers appear
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.queryByText(/measurable_id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/iss_999/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IssuePriorityUpdated/i)).not.toBeInTheDocument();
  });

  it("formats unknown future actions cleanly without exposing raw keys", () => {
    const formatted = formatAuditEntry({
      id: "aud_custom",
      team_id: "team_lead",
      actor_id: "u1",
      actor_name: "Avery Admin",
      action: "RockStatusUpdated",
      entity_type: "rock",
      entity_id: "r1",
      before_state: { status: "off_track", version: 1 },
      after_state: { status: "on_track", version: 2 },
      created_at: "2026-11-11T15:00:00Z",
    });

    expect(formatted.actionLabel).toBe("Rock Status Updated");
    expect(formatted.categoryLabel).toBe("Rock");
    expect(formatted.summary).toBe("Avery Admin performed rock status updated on Rock.");
    expect(formatted.details).toEqual([
      { label: "Status", before: "Off Track", after: "On Track" },
    ]);
  });
});
