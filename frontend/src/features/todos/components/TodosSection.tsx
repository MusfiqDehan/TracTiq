"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckSquare, Clock, Search, Square } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";

interface TodosSectionProps {
  teamId: string;
  initialTodos: TodosListResponse;
  eligibleOwners: EligibleOwnerRead[];
  canWrite: boolean;
  onIssueFocused?: (issueId: string) => void;
}

export function TodosSection({
  teamId,
  initialTodos,
  eligibleOwners,
  canWrite,
  onIssueFocused,
}: TodosSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done" | "overdue">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [extraPages, setExtraPages] = useState<TodoRead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const hasFilters = statusFilter !== "all" || ownerFilter !== "" || search.trim() !== "";

  const filteredQuery = useQuery({
    queryKey: ["team-todos", teamId, statusFilter, ownerFilter, search],
    queryFn: async () => {
      const qs = new URLSearchParams({ status: statusFilter, limit: "30" });
      if (ownerFilter) qs.set("owner_id", ownerFilter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await apiRequest<TodosListResponse>(`/api/teams/${teamId}/todos?${qs.toString()}`);
      setExtraPages([]);
      setNextCursor(res.meta.next_cursor);
      return res.data;
    },
    enabled: hasFilters,
  });

  const activeData = hasFilters ? filteredQuery.data ?? initialTodos : initialTodos;
  const items = hasFilters ? [...activeData.items, ...extraPages] : activeData.items;
  const stats = activeData.last_closed_week;

  const loadMore = async () => {
    if (!nextCursor) return;
    const qs = new URLSearchParams({
      status: statusFilter,
      limit: "30",
      cursor: nextCursor,
    });
    if (ownerFilter) qs.set("owner_id", ownerFilter);
    if (search.trim()) qs.set("search", search.trim());
    const res = await apiRequest<TodosListResponse>(`/api/teams/${teamId}/todos?${qs.toString()}`);
    setExtraPages((prev) => [...prev, ...res.data.items]);
    setNextCursor(res.meta.next_cursor);
  };

  const toggleMutation = useMutation({
    mutationFn: async (params: { todoId: string; done: boolean }) => {
      return apiRequest<TodoRead>(`/api/teams/${teamId}/todos/${params.todoId}`, {
        method: "PATCH",
        body: { done: params.done },
      });
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
      return apiRequest<MakeIssueResult>(`/api/teams/${teamId}/issues/make-issue`, {
        method: "POST",
        body: { todo_id: todoId },
      });
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

  return (
    <Card data-testid="todos-section">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-teal-600" />
            <CardTitle>To-Dos</CardTitle>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            7-day commitments · Last closed week ({formatShortWeek(stats.week_start)})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats.rate_percent === null ? (
            <Badge variant="secondary">Last closed week: No To-Dos due</Badge>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="text-xs font-medium text-slate-600">Completion:</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {stats.rate_percent}% ({stats.done}/{stats.due})
              </span>
              <Badge variant={stats.meets_target ? "success" : "warning"}>
                {stats.meets_target ? "Meets 90% Target" : "Below 90% Target"}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            {(["all", "open", "overdue", "done"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors cursor-pointer",
                  statusFilter === st
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search To-Dos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <select
            aria-label="Filter To-Dos by owner"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700"
          >
            <option value="">All Owners</option>
            {eligibleOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No To-Dos found.</p>
          ) : (
            items.map((todo) => {
              const isDone = todo.done_at !== null;
              return (
                <div
                  key={todo.id}
                  data-testid={`todo-row-${todo.id}`}
                  className={cn(
                    "flex flex-col gap-2 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                    todo.is_overdue && "bg-rose-50/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={!canWrite || toggleMutation.isPending}
                      onClick={() =>
                        toggleMutation.mutate({ todoId: todo.id, done: !isDone })
                      }
                      aria-label={isDone ? `Mark ${todo.title} incomplete` : `Mark ${todo.title} done`}
                      className={cn(
                        "mt-0.5 rounded text-slate-500 transition-colors",
                        canWrite
                          ? "cursor-pointer hover:text-teal-600"
                          : "cursor-default opacity-60"
                      )}
                    >
                      {isDone ? (
                        <CheckSquare className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isDone ? "text-slate-400 line-through" : "text-slate-900"
                          )}
                        >
                          {todo.title}
                        </span>
                        {todo.is_overdue && (
                          <Badge variant="danger">
                            <Clock className="h-3 w-3" />
                            Overdue
                          </Badge>
                        )}
                        {todo.source_issue_title && (
                          <Badge variant="secondary">From: {todo.source_issue_title}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>
                          Owner: <strong className="text-slate-700">{todo.owner_name}</strong>
                        </span>
                        <span>Due {formatShortWeek(todo.due_date)}</span>
                        {todo.done_at && (
                          <span className="text-emerald-700">
                            Done {formatChicagoTimestamp(todo.done_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {todo.is_overdue && canWrite && (
                    <Button
                      size="sm"
                      variant={todo.unsolved_issue_id ? "outline" : "destructive"}
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

        {nextCursor && (
          <div className="flex justify-center pt-1">
            <Button size="sm" variant="outline" onClick={loadMore}>
              Load More To-Dos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
