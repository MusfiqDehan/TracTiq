import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssuesSection } from "../components/IssuesSection";
import { ToastProvider } from "@/components/ui/toast";
import type { EligibleOwnerRead, IssueRead } from "@/lib/types";

const mockIssues: IssueRead[] = [
  {
    id: "i2",
    team_id: "team_lead",
    title: "Two key accounts at risk",
    owner_id: "u2",
    owner_name: "Blake Brooks",
    priority: 5,
    created_at: "2026-10-14T16:00:00Z",
    solved_at: null,
    resolution_note: null,
    solved_in_meeting_id: null,
    version: 1,
    source: null,
  },
  {
    id: "i4",
    team_id: "team_lead",
    title: "Idea: quarterly customer survey",
    owner_id: "u2",
    owner_name: "Blake Brooks",
    priority: null,
    created_at: "2026-09-01T15:00:00Z",
    solved_at: null,
    resolution_note: null,
    solved_in_meeting_id: null,
    version: 1,
    source: null,
  },
];

const eligibleOwners: EligibleOwnerRead[] = [
  { id: "u1", name: "Avery Admin", email: "avery@acme.test", role: "admin" },
  {
    id: "u2",
    name: "Blake Brooks",
    email: "blake@acme.test",
    role: "team_member",
  },
];

describe("IssuesSection", () => {
  it("renders Issues in order and restricts Add To-Do owners to eligible non-observers", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <IssuesSection
            teamId="team_lead"
            unsolvedIssues={mockIssues}
            eligibleOwners={eligibleOwners}
            canWrite={true}
            mode="meeting"
          />
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("Two key accounts at risk")).toBeInTheDocument();
    expect(
      screen.getByText("Idea: quarterly customer survey")
    ).toBeInTheDocument();

    const addTodoBtns = screen.getAllByRole("button", { name: /Add To-Do/i });
    fireEvent.click(addTodoBtns[0]);
    const ownerTrigger = screen.getByRole("combobox", { name: "To-Do owner" });
    fireEvent.keyDown(ownerTrigger, { key: "ArrowDown" });
    const optionNames = screen
      .getAllByRole("option")
      .map((opt) => opt.textContent?.trim());
    expect(optionNames).toEqual(["Avery Admin", "Blake Brooks"]);
    expect(optionNames).not.toContain("Ellis Evans");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    // Solve requires non-empty resolution note
    const solveBtns = screen.getAllByRole("button", { name: /^Solve$/i });
    fireEvent.click(solveBtns[0]);
    const confirmBtn = screen.getByRole("button", { name: /Confirm Solve/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("paginates Issues at 10 per page and auto-jumps to the page containing a highlighted Issue", () => {
    const manyIssues: IssueRead[] = Array.from({ length: 12 }, (_, idx) => ({
      id: `iss_${idx + 1}`,
      team_id: "team_lead",
      title: `Operational issue #${idx + 1}`,
      owner_id: "u2",
      owner_name: "Blake Brooks",
      priority: idx < 5 ? 5 : null,
      created_at: `2026-10-${String(idx + 1).padStart(2, "0")}T15:00:00Z`,
      solved_at: null,
      resolution_note: null,
      solved_in_meeting_id: null,
      version: 1,
      source: null,
    }));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <IssuesSection
            teamId="team_lead"
            unsolvedIssues={manyIssues}
            eligibleOwners={eligibleOwners}
            canWrite={true}
            mode="team"
          />
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("Operational issue #1")).toBeInTheDocument();
    expect(screen.getByText("Operational issue #10")).toBeInTheDocument();
    expect(screen.queryByText("Operational issue #11")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();

    // Navigating to page 2 preserves canonical rank (#11, #12)
    fireEvent.click(screen.getByRole("button", { name: /Next page/i }));
    expect(screen.getByText("Operational issue #11")).toBeInTheDocument();
    expect(screen.getByText("Operational issue #12")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();

    // Back to page 1, then highlighting #12 auto-jumps to page 2
    fireEvent.click(screen.getByRole("button", { name: /Previous page/i }));
    expect(screen.queryByText("Operational issue #12")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <IssuesSection
            teamId="team_lead"
            unsolvedIssues={manyIssues}
            eligibleOwners={eligibleOwners}
            canWrite={true}
            mode="team"
            highlightedIssueId="iss_12"
          />
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("Operational issue #12")).toBeInTheDocument();
    expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();
  });
});
