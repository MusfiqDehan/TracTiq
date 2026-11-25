"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ListTodo,
  Plus,
  Search,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type { EligibleOwnerRead, IssueRead, TodoRead } from "@/lib/types";
import { cn, formatChicagoTimestamp, formatShortWeek } from "@/lib/utils";
import { useViewportTier } from "@/hooks/use-viewport-tier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/ui/pagination";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select";
import { ResponsiveSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

interface IssuesSectionProps {
  teamId: string;
  unsolvedIssues: IssueRead[];
  eligibleOwners: EligibleOwnerRead[];
  canWrite: boolean;
  mode?: "team" | "meeting";
  highlightedIssueId?: string | null;
}

const PAGE_SIZE = 10;

const NEW_PRIORITY_OPTIONS = [
  { value: "", label: "No priority" },
  { value: "5", label: "Priority 5" },
  { value: "4", label: "Priority 4" },
  { value: "3", label: "Priority 3" },
  { value: "2", label: "Priority 2" },
  { value: "1", label: "Priority 1" },
];

const INLINE_PRIORITY_OPTIONS = [
  { value: "", label: "No Prio" },
  { value: "5", label: "P5" },
  { value: "4", label: "P4" },
  { value: "3", label: "P3" },
  { value: "2", label: "P2" },
  { value: "1", label: "P1" },
];

export function IssuesSection({
  teamId,
  unsolvedIssues,
  eligibleOwners,
  canWrite,
  mode = "team",
  highlightedIssueId,
}: IssuesSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const tier = useViewportTier();

  const [activeTab, setActiveTab] = useState<"unsolved" | "solved">("unsolved");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<string>("");

  const [unsolvedSearch, setUnsolvedSearch] = useState("");
  const [unsolvedOwner, setUnsolvedOwner] = useState("");
  const [unsolvedPageState, setUnsolvedPageState] = useState<{
    page: number;
    focusKey: string | null;
  }>({ page: 1, focusKey: null });
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<string | null>(
    null
  );

  const [solvingId, setSolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const [todoIssueId, setTodoIssueId] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoOwnerId, setTodoOwnerId] = useState<string>(
    eligibleOwners[0]?.id || ""
  );

  const [solvedSearch, setSolvedSearch] = useState("");
  const [solvedOwner, setSolvedOwner] = useState("");
  const [solvedPage, setSolvedPage] = useState(1);
  const [loadingMoreSolved, setLoadingMoreSolved] = useState(false);
  const solvedFilterKey = `${teamId}:${solvedSearch.trim()}:${solvedOwner}`;
  const [extraSolved, setExtraSolved] = useState<{
    key: string;
    items: IssueRead[];
    cursor: string | null;
  } | null>(null);

  const solvedQuery = useQuery({
    queryKey: ["team-issues", teamId, "solved", solvedSearch, solvedOwner],
    queryFn: async () => {
      const qs = new URLSearchParams({ status: "solved", limit: "20" });
      if (solvedSearch.trim()) qs.set("search", solvedSearch.trim());
      if (solvedOwner) qs.set("owner_id", solvedOwner);
      return apiRequest<IssueRead[]>(
        `/api/teams/${teamId}/issues?${qs.toString()}`
      );
    },
    enabled: activeTab === "solved",
  });

  const activeExtra = extraSolved?.key === solvedFilterKey ? extraSolved : null;
  const solvedPages = [
    ...(solvedQuery.data?.data ?? []),
    ...(activeExtra?.items ?? []),
  ];
  const solvedCursor =
    activeExtra !== null
      ? activeExtra.cursor
      : (solvedQuery.data?.meta.next_cursor ?? null);

  const loadMoreSolved = async () => {
    if (!solvedCursor || loadingMoreSolved) return;
    setLoadingMoreSolved(true);
    try {
      const qs = new URLSearchParams({
        status: "solved",
        limit: "20",
        cursor: solvedCursor,
      });
      if (solvedSearch.trim()) qs.set("search", solvedSearch.trim());
      if (solvedOwner) qs.set("owner_id", solvedOwner);
      const res = await apiRequest<IssueRead[]>(
        `/api/teams/${teamId}/issues?${qs.toString()}`
      );
      setExtraSolved((prev) => ({
        key: solvedFilterKey,
        items: [
          ...(prev?.key === solvedFilterKey ? prev.items : []),
          ...res.data,
        ],
        cursor: res.meta.next_cursor,
      }));
    } finally {
      setLoadingMoreSolved(false);
    }
  };

  // Preserve canonical §2.6 Issue rank (#1..N) regardless of filtering or pagination
  const issueRankMap = useMemo(() => {
    const map = new Map<string, number>();
    unsolvedIssues.forEach((issue, idx) => {
      map.set(issue.id, idx + 1);
    });
    return map;
  }, [unsolvedIssues]);

  const activeFocusId = highlightedIssueId || recentlyCreatedId;
  const isFocusControllingFilters =
    Boolean(activeFocusId) && unsolvedPageState.focusKey !== activeFocusId;

  const filteredUnsolved = useMemo(() => {
    if (isFocusControllingFilters) return unsolvedIssues;
    const q = unsolvedSearch.trim().toLowerCase();
    return unsolvedIssues.filter((issue) => {
      if (unsolvedOwner && issue.owner_id !== unsolvedOwner) return false;
      if (q && !issue.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [unsolvedIssues, unsolvedSearch, unsolvedOwner, isFocusControllingFilters]);

  const focusedIndex = activeFocusId
    ? filteredUnsolved.findIndex((i) => i.id === activeFocusId)
    : -1;
  const focusedTargetPage =
    focusedIndex >= 0 ? Math.floor(focusedIndex / PAGE_SIZE) + 1 : null;

  const totalUnsolvedPages = Math.max(
    1,
    Math.ceil(filteredUnsolved.length / PAGE_SIZE)
  );
  const rawUnsolvedPage =
    focusedTargetPage !== null && unsolvedPageState.focusKey !== activeFocusId
      ? focusedTargetPage
      : unsolvedPageState.page;
  const safeUnsolvedPage = Math.min(
    Math.max(1, rawUnsolvedPage),
    totalUnsolvedPages
  );

  const pagedUnsolved = useMemo(
    () =>
      filteredUnsolved.slice(
        (safeUnsolvedPage - 1) * PAGE_SIZE,
        safeUnsolvedPage * PAGE_SIZE
      ),
    [filteredUnsolved, safeUnsolvedPage]
  );

  // Smoothly scroll focused/newly created Issue into view once its page is rendered
  useEffect(() => {
    if (!activeFocusId) return;
    const el = document.querySelector(
      `[data-testid="issue-card-${activeFocusId}"]`
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeFocusId, safeUnsolvedPage]);

  const effectiveTab: "unsolved" | "solved" = isFocusControllingFilters
    ? "unsolved"
    : activeTab;

  const totalSolvedPages = Math.max(
    1,
    Math.ceil(solvedPages.length / PAGE_SIZE)
  );
  const safeSolvedPage = Math.min(Math.max(1, solvedPage), totalSolvedPages);
  const pagedSolved = solvedPages.slice(
    (safeSolvedPage - 1) * PAGE_SIZE,
    safeSolvedPage * PAGE_SIZE
  );

  const createIssueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<IssueRead>(`/api/teams/${teamId}/issues`, {
        method: "POST",
        body: {
          title: newTitle.trim(),
          priority: newPriority ? Number(newPriority) : null,
        },
      });
    },
    onSuccess: (res) => {
      const created = res.data;
      setNewTitle("");
      setNewPriority("");
      setUnsolvedSearch("");
      setUnsolvedOwner("");
      setActiveTab("unsolved");
      setRecentlyCreatedId(created.id);
      setUnsolvedPageState({ page: 1, focusKey: null });
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      pushToast({
        title: "Issue created",
        description:
          created.priority !== null
            ? `${created.title} · Priority P${created.priority} (positioned in Issue order)`
            : `${created.title} · No priority (positioned at end of queue — set P5–P1 to move up)`,
        variant: "success",
      });
      setTimeout(() => {
        setRecentlyCreatedId((curr) => (curr === created.id ? null : curr));
      }, 5000);
    },
    onError: (err) => {
      pushToast({
        title: "Failed to create Issue",
        description: err instanceof Error ? err.message : "Validation error",
        variant: "error",
      });
    },
  });

  const priorityMutation = useMutation({
    mutationFn: async (params: {
      issueId: string;
      priority: number | null;
      version: number;
    }) => {
      return apiRequest<IssueRead>(
        `/api/teams/${teamId}/issues/${params.issueId}`,
        {
          method: "PATCH",
          body: { priority: params.priority },
          ifMatchVersion: params.version,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        pushToast({
          title: "Priority conflict detected",
          description:
            "Another teammate updated this Issue. Reloaded latest order.",
          variant: "warning",
        });
        queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      } else {
        pushToast({
          title: "Could not update priority",
          description: err instanceof Error ? err.message : "Error",
          variant: "error",
        });
      }
    },
  });

  const solveMutation = useMutation({
    mutationFn: async (params: { issueId: string; note: string }) => {
      return apiRequest<IssueRead>(
        `/api/teams/${teamId}/issues/${params.issueId}/solve`,
        {
          method: "POST",
          body: { resolution_note: params.note },
        }
      );
    },
    onSuccess: () => {
      setSolvingId(null);
      setResolutionNote("");
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-issues", teamId] });
      pushToast({ title: "Issue solved", variant: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Resolution note required",
        description:
          err instanceof Error ? err.message : "Enter a resolution note",
        variant: "error",
      });
    },
  });

  const addTodoMutation = useMutation({
    mutationFn: async (params: {
      issueId: string;
      title: string;
      ownerId: string;
    }) => {
      return apiRequest<TodoRead>(
        `/api/teams/${teamId}/issues/${params.issueId}/todos`,
        {
          method: "POST",
          body: { title: params.title, owner_id: params.ownerId },
        }
      );
    },
    onSuccess: (res) => {
      setTodoIssueId(null);
      setTodoTitle("");
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-todos", teamId] });
      pushToast({
        title: "To-Do added (+7 days)",
        description: `${res.data.title} · Due ${formatShortWeek(res.data.due_date)}`,
        variant: "success",
      });
    },
    onError: (err) => {
      pushToast({
        title: "Could not add To-Do",
        description: err instanceof Error ? err.message : "Validation failed",
        variant: "error",
      });
    },
  });

  const ownerOptions = eligibleOwners.map((owner) => ({
    value: owner.id,
    label: owner.name,
  }));

  const ownerFilterOptions = [
    { value: "", label: "All Owners" },
    ...ownerOptions,
  ];

  const activeTodoIssue = todoIssueId
    ? (unsolvedIssues.find((i) => i.id === todoIssueId) ?? null)
    : null;
  const activeSolvingIssue = solvingId
    ? (unsolvedIssues.find((i) => i.id === solvingId) ?? null)
    : null;

  const renderSourceBadge = (issue: IssueRead) => {
    if (!issue.source) return null;
    if (issue.source.type === "measurable") {
      return (
        <Badge variant="brand">
          {issue.source.measurable_name || issue.source.measurable_id} ·{" "}
          {issue.source.week_start
            ? formatShortWeek(issue.source.week_start)
            : ""}
        </Badge>
      );
    }
    if (issue.source.type === "rock") {
      return (
        <Badge variant="off-track">
          Rock: {issue.source.rock_title || issue.source.rock_id}
        </Badge>
      );
    }
    return (
      <Badge variant="warning">
        To-Do: {issue.source.todo_title || issue.source.todo_id}
      </Badge>
    );
  };

  const renderAddTodoForm = (issue: IssueRead, stacked = false) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!todoTitle.trim()) return;
        addTodoMutation.mutate({
          issueId: issue.id,
          title: todoTitle.trim(),
          ownerId: todoOwnerId || eligibleOwners[0]?.id || "",
        });
      }}
      className={cn(
        "flex flex-col gap-2",
        !stacked &&
          "mt-3 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-subtle)]/50 p-3 sm:flex-row sm:items-center"
      )}
    >
      <Input
        placeholder="To-Do action item (due in 7 days)..."
        aria-label="To-Do title from Issue"
        value={todoTitle}
        onChange={(e) => setTodoTitle(e.target.value)}
        className="flex-1"
      />
      <SelectField
        ariaLabel="To-Do owner"
        value={todoOwnerId || eligibleOwners[0]?.id || ""}
        onValueChange={setTodoOwnerId}
        options={ownerOptions}
        size={stacked ? "md" : "sm"}
        triggerClassName={stacked ? "w-full" : "sm:w-40"}
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!todoTitle.trim() || addTodoMutation.isPending}
          className={stacked ? "flex-1" : undefined}
        >
          Save To-Do
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setTodoIssueId(null)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  const renderSolveForm = (issue: IssueRead, stacked = false) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!resolutionNote.trim()) {
          pushToast({
            title: "Resolution note is required",
            variant: "error",
          });
          return;
        }
        solveMutation.mutate({
          issueId: issue.id,
          note: resolutionNote.trim(),
        });
      }}
      className={cn(
        "flex flex-col gap-2",
        !stacked &&
          "mt-3 rounded-[8px] border border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] p-3 sm:flex-row sm:items-center"
      )}
    >
      <Input
        placeholder="Required resolution note..."
        aria-label="Resolution note"
        value={resolutionNote}
        onChange={(e) => setResolutionNote(e.target.value)}
        className="flex-1"
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!resolutionNote.trim() || solveMutation.isPending}
          className={stacked ? "flex-1" : undefined}
        >
          Confirm Solve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setSolvingId(null)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <Card className="flex h-full flex-col" data-testid="issues-section">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--status-danger-text)]" />
            <CardTitle>
              {mode === "meeting" ? "IDS · Identify, Discuss, Solve" : "Issues"}
            </CardTitle>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Ordered by priority (5 → 1), oldest first, no priority last.
          </p>
        </div>

        <SegmentedControl
          value={effectiveTab}
          onChange={(next) => {
            setActiveTab(next);
            setUnsolvedPageState((prev) => ({
              ...prev,
              focusKey: activeFocusId,
            }));
          }}
          size="sm"
          ariaLabel="Issues status view"
          options={[
            {
              value: "unsolved",
              label: (
                <span className="tabular-nums">
                  Unsolved ({unsolvedIssues.length})
                </span>
              ),
            },
            {
              value: "solved",
              label: (
                <span className="tabular-nums">
                  Solved
                  {solvedQuery.data ? ` (${solvedPages.length}${solvedCursor ? "+" : ""})` : ""}
                </span>
              ),
            },
          ]}
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {effectiveTab === "unsolved" ? (
          <>
            {canWrite && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTitle.trim()) createIssueMutation.mutate();
                }}
                className="flex flex-col gap-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 sm:flex-row sm:items-center"
              >
                <Input
                  placeholder="Raise a new Issue..."
                  aria-label="New Issue title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="flex-1"
                />
                <SelectField
                  ariaLabel="New Issue priority"
                  value={newPriority}
                  onValueChange={setNewPriority}
                  options={NEW_PRIORITY_OPTIONS}
                  size="md"
                  triggerClassName="w-full sm:w-36"
                />
                <Button
                  type="submit"
                  size="md"
                  variant="primary"
                  disabled={!newTitle.trim() || createIssueMutation.isPending}
                >
                  <Plus className="h-4 w-4" />
                  Add Issue
                </Button>
              </form>
            )}

            {/* Search & Owner Filter for Unsolved Issues */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-[var(--text-muted)] sm:top-2.5" />
                <Input
                  placeholder="Search unsolved issues..."
                  aria-label="Search unsolved issues"
                  value={isFocusControllingFilters ? "" : unsolvedSearch}
                  onChange={(e) => {
                    setUnsolvedSearch(e.target.value);
                    setUnsolvedPageState({
                      page: 1,
                      focusKey: activeFocusId,
                    });
                  }}
                  className="pl-9"
                />
              </div>
              <SelectField
                ariaLabel="Filter unsolved issues by owner"
                value={isFocusControllingFilters ? "" : unsolvedOwner}
                onValueChange={(val) => {
                  setUnsolvedOwner(val);
                  setUnsolvedPageState({
                    page: 1,
                    focusKey: activeFocusId,
                  });
                }}
                options={ownerFilterOptions}
                size="md"
                triggerClassName="w-full sm:w-40"
              />
            </div>

            <div className="flex-1 space-y-2">
              {pagedUnsolved.length === 0 ? (
                <p className="rounded-[8px] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-muted)]">
                  {unsolvedIssues.length === 0
                    ? "No unsolved Issues for this team."
                    : "No unsolved Issues match the current filters."}
                </p>
              ) : (
                pagedUnsolved.map((issue) => {
                  const rank = issueRankMap.get(issue.id) ?? 0;
                  const isHighlighted = activeFocusId === issue.id;
                  const isNew = recentlyCreatedId === issue.id;
                  const isSolving = solvingId === issue.id;
                  const isAddingTodo = todoIssueId === issue.id;

                  return (
                    <div
                      key={issue.id}
                      data-testid={`issue-card-${issue.id}`}
                      className={cn(
                        "rounded-[8px] border p-3 transition-colors sm:px-4",
                        isHighlighted
                          ? "border-[var(--accent-primary)] bg-[var(--accent-subtle)]/55"
                          : "border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]"
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
                              #{rank}
                            </span>
                            <SelectField
                              ariaLabel={`Priority for ${issue.title}`}
                              disabled={!canWrite}
                              value={
                                issue.priority !== null
                                  ? String(issue.priority)
                                  : ""
                              }
                              onValueChange={(val) => {
                                priorityMutation.mutate({
                                  issueId: issue.id,
                                  priority: val ? Number(val) : null,
                                  version: issue.version,
                                });
                              }}
                              options={INLINE_PRIORITY_OPTIONS}
                              size="sm"
                              triggerClassName={cn(
                                "w-24 font-bold tabular-nums",
                                issue.priority && issue.priority >= 4
                                  ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
                                  : issue.priority
                                    ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
                                    : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                              )}
                            />
                            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                              {issue.title}
                            </h4>
                            {isNew && (
                              <Badge variant="brand" dot>
                                New
                              </Badge>
                            )}
                            {renderSourceBadge(issue)}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                            <span>
                              Owner:{" "}
                              <strong className="font-semibold text-[var(--text-secondary)]">
                                {issue.owner_name}
                              </strong>
                            </span>
                            <span className="tabular-nums">
                              Created {formatChicagoTimestamp(issue.created_at)}
                            </span>
                          </div>
                        </div>

                        {canWrite && (
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setTodoIssueId(isAddingTodo ? null : issue.id);
                                setSolvingId(null);
                                setTodoOwnerId(eligibleOwners[0]?.id || "");
                              }}
                            >
                              <ListTodo className="h-3.5 w-3.5" />
                              Add To-Do
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                setSolvingId(isSolving ? null : issue.id);
                                setTodoIssueId(null);
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Solve
                            </Button>
                          </div>
                        )}
                      </div>

                      {tier !== "mobile" &&
                        isAddingTodo &&
                        canWrite &&
                        renderAddTodoForm(issue, false)}
                      {tier !== "mobile" &&
                        isSolving &&
                        canWrite &&
                        renderSolveForm(issue, false)}
                    </div>
                  );
                })
              )}
            </div>

            <PaginationBar
              page={safeUnsolvedPage}
              pageSize={PAGE_SIZE}
              totalItems={filteredUnsolved.length}
              onPageChange={(nextPage) =>
                setUnsolvedPageState({
                  page: nextPage,
                  focusKey: activeFocusId,
                })
              }
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-[var(--text-muted)] sm:top-2.5" />
                <Input
                  placeholder="Search solved issues or resolution notes..."
                  value={solvedSearch}
                  onChange={(e) => {
                    setSolvedSearch(e.target.value);
                    setSolvedPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              <SelectField
                ariaLabel="Filter solved issues by owner"
                value={solvedOwner}
                onValueChange={(val) => {
                  setSolvedOwner(val);
                  setSolvedPage(1);
                }}
                options={ownerFilterOptions}
                size="md"
                triggerClassName="w-full sm:w-44"
              />
            </div>

            {solvedQuery.isLoading ? (
              <p className="flex-1 py-6 text-center text-sm text-[var(--text-muted)]">
                Loading solved issues...
              </p>
            ) : pagedSolved.length === 0 ? (
              <p className="flex-1 rounded-[8px] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-muted)]">
                No solved Issues match the current filters.
              </p>
            ) : (
              <>
                <div className="flex-1 space-y-2">
                  {pagedSolved.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 sm:px-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="on-track" dot>
                            Solved
                          </Badge>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {issue.title}
                          </span>
                          {renderSourceBadge(issue)}
                        </div>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">
                          {issue.solved_at
                            ? formatChicagoTimestamp(issue.solved_at)
                            : ""}
                        </span>
                      </div>
                      <p className="mt-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                        <strong className="font-semibold text-[var(--text-primary)]">
                          Resolution:
                        </strong>{" "}
                        {issue.resolution_note}
                      </p>
                    </div>
                  ))}
                </div>

                <PaginationBar
                  page={safeSolvedPage}
                  pageSize={PAGE_SIZE}
                  totalItems={solvedPages.length}
                  onPageChange={setSolvedPage}
                  hasMoreRemote={Boolean(solvedCursor)}
                  loadingMoreRemote={loadingMoreSolved}
                  onLoadMoreRemote={loadMoreSolved}
                />
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* Mobile Keyboard-Safe Bottom Sheets for Add To-Do & Solve Issue */}
      {tier === "mobile" && canWrite && (
        <>
          <ResponsiveSheet
            open={Boolean(activeTodoIssue)}
            onOpenChange={(open) => {
              if (!open) setTodoIssueId(null);
            }}
            title="Add 7-Day To-Do"
            description={activeTodoIssue?.title}
            desktopVariant="modal"
          >
            {activeTodoIssue && (
              <div className="p-4">
                {renderAddTodoForm(activeTodoIssue, true)}
              </div>
            )}
          </ResponsiveSheet>

          <ResponsiveSheet
            open={Boolean(activeSolvingIssue)}
            onOpenChange={(open) => {
              if (!open) setSolvingId(null);
            }}
            title="Solve Issue"
            description={activeSolvingIssue?.title}
            desktopVariant="modal"
          >
            {activeSolvingIssue && (
              <div className="p-4">
                {renderSolveForm(activeSolvingIssue, true)}
              </div>
            )}
          </ResponsiveSheet>
        </>
      )}
    </Card>
  );
}
