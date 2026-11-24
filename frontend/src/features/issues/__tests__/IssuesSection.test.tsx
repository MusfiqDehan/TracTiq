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
  { id: "u2", name: "Blake Brooks", email: "blake@acme.test", role: "team_member" },
];

describe("IssuesSection", () => {
  it("renders Issues in order and restricts Add To-Do owners to eligible non-observers", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    expect(screen.getByText("Idea: quarterly customer survey")).toBeInTheDocument();

    const addTodoBtns = screen.getAllByRole("button", { name: /Add To-Do/i });
    fireEvent.click(addTodoBtns[0]);
    const ownerSelect = screen.getByLabelText("To-Do owner") as HTMLSelectElement;
    const optionNames = Array.from(ownerSelect.options).map((o) => o.text);
    expect(optionNames).toEqual(["Avery Admin", "Blake Brooks"]);
    expect(optionNames).not.toContain("Ellis Evans");

    // Solve requires non-empty resolution note
    const solveBtns = screen.getAllByRole("button", { name: /^Solve$/i });
    fireEvent.click(solveBtns[0]);
    const confirmBtn = screen.getByRole("button", { name: /Confirm Solve/i });
    expect(confirmBtn).toBeDisabled();
  });
});
