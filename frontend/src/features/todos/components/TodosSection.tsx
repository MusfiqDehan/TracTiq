"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Clock,
  Search,
  Square,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type {
  EligibleOwnerRead,
  MakeIssueResult,
  TodoRead,
  TodosListResponse,
} from "@/lib/types";
import { cn, formatChicagoTimestamp, formatShortWeek } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/ui/pagination";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

interface TodosSectionProps {
  teamId: string;
  initialTodos: TodosListResponse;
  eligibleOwners: EligibleOwnerRead[];
  canWrite: boolean;
  onIssueFocused?: (issueId: string) => void;
}

const PAGE_SIZE = 10;

export function TodosSection({
  teamId,
  initialTodos,
  eligibleOwners,
  canWrite,
  onIssueFocused,
}: TodosSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "done" | "overdue"
  >("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [extraPages, setExtraPages] = useState<TodoRead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const hasFilters =
    statusFilter !== "all" || ownerFilter !== "" || search.trim() !== "";

  const filteredQuery = useQuery({
    queryKey: ["team-todos", teamId, statusFilter, ownerFilter, search],
    queryFn: async () => {
      const qs = new URLSearchParams({ status: statusFilter, limit: "30" });
      if (ownerFilter) qs.set("owner_id", ownerFilter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await apiRequest<TodosListResponse>(
        `/api/teams/${teamId}/todos?${qs.toString()}`
      );
      setExtraPages([]);
      setNextCursor(res.meta.next_cursor);
      return res.data;
    },
    enabled: hasFilters,
  });

  const activeData = hasFilters
    ? (filteredQuery.data ?? initialTodos)
    : initialTodos;
  const items = hasFilters
    ? [...activeData.items, ...extraPages]
    : activeData.items;
  const stats = activeData.last_closed_week;

  // Compute exact filter pill counts from the loaded team To-Do set
  const statusCounts = useMemo(() => {
    const base = initialTodos.items;
    let open = 0;
    let overdue = 0;
    let done = 0;
    for (const td of base) {
      if (td.done_at !== null) {
        done += 1;
      } else {
        open += 1;
        if (td.is_overdue) overdue += 1;
      }
    }
    return { all: base.length, open, overdue, done };
  }, [initialTodos.items]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedItems = items.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({
        status: statusFilter,
        limit: "30",
        cursor: nextCursor,
      });
      if (ownerFilter) qs.set("owner_id", ownerFilter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await apiRequest<TodosListResponse>(
        `/api/teams/${teamId}/todos?${qs.toString()}`
      );
      setExtraPages((prev) => [...prev, ...res.data.items]);
      setNextCursor(res.meta.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: async (params: { todoId: string; done: boolean }) => {
      return apiRequest<TodoRead>(
        `/api/teams/${teamId}/todos/${params.todoId}`,
        {
          method: "PATCH",
          body: { done: params.done },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-todos", teamId] });
    },
    onError: (err) => {
      pushToast({
        title: "Could not update To-Do",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    },
  });

  const makeIssueMutation = useMutation({
    mutationFn: async (todoId: string) => {
      return apiRequest<MakeIssueResult>(
        `/api/teams/${teamId}/issues/make-issue`,
        {
          method: "POST",
          body: { todo_id: todoId },
        }
      );
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-issues", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-todos", teamId] });
      onIssueFocused?.(res.data.issue.id);
      pushToast({
        title: res.data.created
          ? "Issue created from overdue To-Do"
          : "Existing unsolved Issue returned",
        description: res.data.issue.title,
        variant: res.data.created ? "success" : "default",
      });
    },
    onError: (err) => {
      pushToast({
        title: "Unable to create Issue",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    },
  });

  const ownerFilterOptions = [
    { value: "", label: "All Owners" },
    ...eligibleOwners.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <Card className="flex h-full flex-col" data-testid="todos-section">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-[var(--accent-text)]" />
            <CardTitle>To-Dos</CardTitle>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
            7-day commitments · Last closed week (
            {formatShortWeek(stats.week_start)})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats.rate_percent === null ? (
            <Badge variant="neutral">Last closed week: No To-Dos due</Badge>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Completion:
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                {stats.rate_percent}% ({stats.done}/{stats.due})
              </span>
              <Badge variant={stats.meets_target ? "on-track" : "warning"} dot>
                {stats.meets_target ? "Meets 90% Target" : "Below 90% Target"}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SegmentedControl
            value={statusFilter}
            onChange={(next) => {
              setStatusFilter(next);
              setPage(1);
            }}
            size="sm"
            ariaLabel="Filter To-Dos by status"
            className="w-full"
            options={[
              {
                value: "all",
                label: (
                  <span className="tabular-nums">
                    All ({statusCounts.all})
                  </span>
                ),
              },
              {
                value: "open",
                label: (
                  <span className="tabular-nums">
                    Open ({statusCounts.open})
                  </span>
                ),
              },
              {
                value: "overdue",
                label: (
                  <span className="tabular-nums">
                    Overdue ({statusCounts.overdue})
                  </span>
                ),
              },
              {
                value: "done",
                label: (
                  <span className="tabular-nums">
                    Done ({statusCounts.done})
                  </span>
                ),
              },
            ]}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-[var(--text-muted)] sm:top-2.5" />
              <Input
                placeholder="Search To-Dos..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            <SelectField
              ariaLabel="Filter To-Dos by owner"
              value={ownerFilter}
              onValueChange={(val) => {
                setOwnerFilter(val);
                setPage(1);
              }}
              options={ownerFilterOptions}
              size="md"
              triggerClassName="w-full sm:w-40"
            />
          </div>
        </div>

        <div className="flex-1">
          <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[8px] border border-[var(--border-default)]">
            {pagedItems.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                No To-Dos found.
              </p>
            ) : (
              pagedItems.map((todo) => {
                const isDone = todo.done_at !== null;
                return (
                  <div
                    key={todo.id}
                    data-testid={`todo-row-${todo.id}`}
                    className={cn(
                      "flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                      todo.is_overdue
                        ? "bg-[var(--status-danger-bg)]/45"
                        : "bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]/35"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        disabled={!canWrite || toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({
                            todoId: todo.id,
                            done: !isDone,
                          })
                        }
                        aria-label={
                          isDone
                            ? `Mark ${todo.title} incomplete`
                            : `Mark ${todo.title} done`
                        }
                        className={cn(
                          "-mt-1.5 -ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-muted)] transition-colors sm:mt-0 sm:-ml-1 sm:h-8 sm:w-8",
                          canWrite
                            ? "cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--accent-text)]"
                            : "cursor-default opacity-60"
                        )}
                      >
                        {isDone ? (
                          <CheckSquare className="h-4 w-4 text-[var(--status-on-track-text)]" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              isDone
                                ? "text-[var(--text-muted)] line-through"
                                : "text-[var(--text-primary)]"
                            )}
                          >
                            {todo.title}
                          </span>
                          {todo.is_overdue && (
                            <Badge variant="off-track">
                              <Clock className="h-3 w-3" />
                              Overdue
                            </Badge>
                          )}
                          {todo.source_issue_title && (
                            <Badge variant="neutral">
                              From: {todo.source_issue_title}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                          <span>
                            Owner:{" "}
                            <strong className="font-semibold text-[var(--text-secondary)]">
                              {todo.owner_name}
                            </strong>
                          </span>
                          <span className="tabular-nums">
                            Due {formatShortWeek(todo.due_date)}
                          </span>
                          {todo.done_at && (
                            <span className="font-medium text-[var(--status-on-track-text)] tabular-nums">
                              Done {formatChicagoTimestamp(todo.done_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {todo.is_overdue && canWrite && (
                      <Button
                        size="sm"
                        variant={
                          todo.unsolved_issue_id ? "secondary" : "destructive"
                        }
                        onClick={() => makeIssueMutation.mutate(todo.id)}
                        className="shrink-0"
                      >
                        {todo.unsolved_issue_id ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            View Issue
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Make it an Issue
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <PaginationBar
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={items.length}
          onPageChange={setPage}
          hasMoreRemote={Boolean(hasFilters && nextCursor)}
          loadingMoreRemote={loadingMore}
          onLoadMoreRemote={loadMore}
        />
      </CardContent>
    </Card>
  );
}
