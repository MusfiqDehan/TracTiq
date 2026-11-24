import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScorecardSection } from "../components/ScorecardSection";
import { ToastProvider } from "@/components/ui/toast";
import type { ScorecardRead } from "@/lib/types";

const mockScorecard: ScorecardRead = {
  team_id: "team_lead",
  weeks: ["2026-11-02", "2026-11-09"],
  current_week: "2026-11-09",
  last_closed_week: "2026-11-02",
  measurables: [
    {
      id: "m1",
      team_id: "team_lead",
      name: "New deals closed",
      owner_id: "u2",
      owner_name: "Blake Brooks",
      unit: "count",
      goal: { type: "at_least", value: 10, min: null, max: null },
      cells: {
        "2026-11-02": {
          score_id: "sc_1",
          measurable_id: "m1",
          week_start: "2026-11-02",
          value: 8,
          status: "off_track",
          version: 1,
          updated_at: "2026-11-11T15:00:00Z",
          unsolved_issue_id: "i5",
        },
        "2026-11-09": {
          score_id: null,
          measurable_id: "m1",
          week_start: "2026-11-09",
          value: null,
          status: "pending",
          version: null,
          updated_at: null,
          unsolved_issue_id: null,
        },
      },
    },
  ],
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ScorecardSection", () => {
  it("renders measurables, statuses, and Make-it-an-Issue button for writers", () => {
    renderWithProviders(
      <ScorecardSection teamId="team_lead" scorecard={mockScorecard} canWrite={true} />
    );
    expect(screen.getByText("New deals closed")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByTestId("make-issue-m1-2026-11-02")).toBeInTheDocument();

    // Clicking score opens inline input for writer
    fireEvent.click(screen.getByText("8"));
    expect(
      screen.getByLabelText("Edit New deals closed score for 2026-11-02")
    ).toBeInTheDocument();
  });

  it("hides Make-it-an-Issue and blocks inline edits for Observers", () => {
    const onIssueFocused = vi.fn();
    renderWithProviders(
      <ScorecardSection
        teamId="team_lead"
        scorecard={mockScorecard}
        canWrite={false}
        onIssueFocused={onIssueFocused}
      />
    );
    expect(screen.getByText("Read-only Observer")).toBeInTheDocument();
    expect(screen.queryByTestId("make-issue-m1-2026-11-02")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("8"));
    expect(
      screen.queryByLabelText("Edit New deals closed score for 2026-11-02")
    ).not.toBeInTheDocument();
  });
});
