"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ListTodo,
  Plus,
  Search,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  EligibleOwnerRead,
  IssueRead,
  TodoRead,
} from "@/lib/types";
import { cn, formatChicagoTimestamp, formatShortWeek } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface IssuesSectionProps {
  teamId: string;
  unsolvedIssues: IssueRead[];
  eligibleOwners: EligibleOwnerRead[];
  canWrite: boolean;
  mode?: "team" | "meeting";
  highlightedIssueId?: string | null;
}

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

  const [activeTab, setActiveTab] = useState<"unsolved" | "solved">("unsolved");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<string>("");

  const [solvingId, setSolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const [todoIssueId, setTodoIssueId] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoOwnerId, setTodoOwnerId] = useState<string>(eligibleOwners[0]?.id || "");

  const [solvedSearch, setSolvedSearch] = useState("");
  const [solvedOwner, setSolvedOwner] = useState("");
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
      return apiRequest<IssueRead[]>(`/api/teams/${teamId}/issues?${qs.toString()}`);
    },
    enabled: activeTab === "solved",
  });

  const activeExtra = extraSolved?.key === solvedFilterKey ? extraSolved : null;
  const solvedPages = [...(solvedQuery.data?.data ?? []), ...(activeExtra?.items ?? [])];
  const solvedCursor =
    activeExtra !== null ? activeExtra.cursor : (solvedQuery.data?.meta.next_cursor ?? null);

  const loadMoreSolved = async () => {
    if (!solvedCursor) return;
    const qs = new URLSearchParams({
      status: "solved",
      limit: "20",
      cursor: solvedCursor,
    });
    if (solvedSearch.trim()) qs.set("search", solvedSearch.trim());
    if (solvedOwner) qs.set("owner_id", solvedOwner);
    const res = await apiRequest<IssueRead[]>(`/api/teams/${teamId}/issues?${qs.toString()}`);
    setExtraSolved((prev) => ({
      key: solvedFilterKey,
      items: [...(prev?.key === solvedFilterKey ? prev.items : []), ...res.data],
      cursor: res.meta.next_cursor,
    }));
  };

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
    onSuccess: () => {
      setNewTitle("");
      setNewPriority("");
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      pushToast({ title: "Issue created", variant: "success" });
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
      return apiRequest<IssueRead>(`/api/teams/${teamId}/issues/${params.issueId}`, {
        method: "PATCH",
        body: { priority: params.priority },
        ifMatchVersion: params.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        pushToast({
          title: "Priority conflict detected",
          description: "Another teammate updated this Issue. Reloaded latest order.",
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
      return apiRequest<IssueRead>(`/api/teams/${teamId}/issues/${params.issueId}/solve`, {
        method: "POST",
        body: { resolution_note: params.note },
      });
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
        description: err instanceof Error ? err.message : "Enter a resolution note",
        variant: "error",
      });
    },
  });

  const addTodoMutation = useMutation({
    mutationFn: async (params: { issueId: string; title: string; ownerId: string }) => {
      return apiRequest<TodoRead>(`/api/teams/${teamId}/issues/${params.issueId}/todos`, {
        method: "POST",
        body: { title: params.title, owner_id: params.ownerId },
      });
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

  const renderSourceBadge = (issue: IssueRead) => {
    if (!issue.source) return null;
    if (issue.source.type === "measurable") {
      return (
        <Badge variant="accent">
          {issue.source.measurable_name || issue.source.measurable_id} ·{" "}
          {issue.source.week_start ? formatShortWeek(issue.source.week_start) : ""}
        </Badge>
      );
    }
    if (issue.source.type === "rock") {
      return <Badge variant="danger">Rock: {issue.source.rock_title || issue.source.rock_id}</Badge>;
    }
    return <Badge variant="warning">To-Do: {issue.source.todo_title || issue.source.todo_id}</Badge>;
  };

  return (
    <Card data-testid="issues-section">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <CardTitle>
              {mode === "meeting" ? "IDS · Identify, Discuss, Solve" : "Issues"}
            </CardTitle>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ordered by priority (5 → 1), oldest first, no priority last.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("unsolved")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
              activeTab === "unsolved"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            Unsolved ({unsolvedIssues.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("solved")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
              activeTab === "solved"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            Solved
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {activeTab === "unsolved" ? (
          <>
            {canWrite && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTitle.trim()) createIssueMutation.mutate();
                }}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:flex-row"
              >
                <Input
                  placeholder="Raise a new Issue..."
                  aria-label="New Issue title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="flex-1 bg-white"
                />
                <select
                  aria-label="New Issue priority"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700"
                >
                  <option value="">No priority</option>
                  {[5, 4, 3, 2, 1].map((p) => (
                    <option key={p} value={p}>
                      Priority {p}
                    </option>
                  ))}
                </select>
                <Button
                  type="submit"
                  size="default"
                  disabled={!newTitle.trim() || createIssueMutation.isPending}
                >
                  <Plus className="h-4 w-4" />
                  Add Issue
                </Button>
              </form>
            )}

            <div className="space-y-2.5">
              {unsolvedIssues.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No unsolved Issues for this team.
                </p>
              )}

              {unsolvedIssues.map((issue, idx) => {
                const isHighlighted = highlightedIssueId === issue.id;
                const isSolving = solvingId === issue.id;
                const isAddingTodo = todoIssueId === issue.id;

                return (
                  <div
                    key={issue.id}
                    data-testid={`issue-card-${issue.id}`}
                    className={cn(
                      "rounded-xl border p-3.5 transition-all",
                      isHighlighted
                        ? "border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/30"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-400">
                            #{idx + 1}
                          </span>
                          <select
                            aria-label={`Priority for ${issue.title}`}
                            disabled={!canWrite}
                            value={issue.priority ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : null;
                              priorityMutation.mutate({
                                issueId: issue.id,
                                priority: val,
                                version: issue.version,
                              });
                            }}
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-xs font-bold",
                              issue.priority && issue.priority >= 4
                                ? "border-rose-200 bg-rose-50 text-rose-800"
                                : issue.priority
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-slate-200 bg-slate-100 text-slate-500"
                            )}
                          >
                            <option value="">No Prio</option>
                            {[5, 4, 3, 2, 1].map((p) => (
                              <option key={p} value={p}>
                                P{p}
                              </option>
                            ))}
                          </select>
                          <h4 className="text-sm font-semibold text-slate-900">{issue.title}</h4>
                          {renderSourceBadge(issue)}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>
                            Owner:{" "}
                            <strong className="font-medium text-slate-700">
                              {issue.owner_name}
                            </strong>
                          </span>
                          <span>Created {formatChicagoTimestamp(issue.created_at)}</span>
                        </div>
                      </div>

                      {canWrite && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
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
                            variant="accent"
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

                    {isAddingTodo && canWrite && (
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
                        className="mt-3 flex flex-col gap-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3 sm:flex-row sm:items-center"
                      >
                        <Input
                          placeholder="To-Do action item (due in 7 days)..."
                          aria-label="To-Do title from Issue"
                          value={todoTitle}
                          onChange={(e) => setTodoTitle(e.target.value)}
                          className="flex-1 bg-white"
                        />
                        <select
                          aria-label="To-Do owner"
                          value={todoOwnerId}
                          onChange={(e) => setTodoOwnerId(e.target.value)}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
                        >
                          {eligibleOwners.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                              {owner.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-1.5">
                          <Button
                            type="submit"
                            size="sm"
                            variant="accent"
                            disabled={!todoTitle.trim() || addTodoMutation.isPending}
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
                    )}

                    {isSolving && canWrite && (
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
                        className="mt-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 sm:flex-row sm:items-center"
                      >
                        <Input
                          placeholder="Required resolution note..."
                          aria-label="Resolution note"
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          className="flex-1 bg-white"
                        />
                        <div className="flex gap-1.5">
                          <Button
                            type="submit"
                            size="sm"
                            variant="accent"
                            disabled={!resolutionNote.trim() || solveMutation.isPending}
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
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search solved issues or resolution notes..."
                  value={solvedSearch}
                  onChange={(e) => setSolvedSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                aria-label="Filter solved issues by owner"
                value={solvedOwner}
                onChange={(e) => setSolvedOwner(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
              >
                <option value="">All Owners</option>
                {eligibleOwners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            {solvedQuery.isLoading ? (
              <p className="py-6 text-center text-sm text-slate-500">Loading solved issues...</p>
            ) : solvedPages.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No solved Issues match the current filters.
              </p>
            ) : (
              <div className="space-y-2.5">
                {solvedPages.map((issue) => (
                  <div
                    key={issue.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="success">Solved</Badge>
                        <span className="text-sm font-semibold text-slate-900">{issue.title}</span>
                        {renderSourceBadge(issue)}
                      </div>
                      <span className="text-xs text-slate-500">
                        {issue.solved_at ? formatChicagoTimestamp(issue.solved_at) : ""}
                      </span>
                    </div>
                    <p className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                      <strong className="text-slate-900">Resolution:</strong>{" "}
                      {issue.resolution_note}
                    </p>
                  </div>
                ))}
                {solvedCursor && (
                  <div className="flex justify-center pt-2">
                    <Button size="sm" variant="outline" onClick={loadMoreSolved}>
                      Load More Solved Issues
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
