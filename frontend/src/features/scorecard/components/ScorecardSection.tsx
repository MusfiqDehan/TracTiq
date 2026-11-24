"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Edit3, Target } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  MakeIssueResult,
  MeasurableRowRead,
  ScorecardRead,
  ScoreCellRead,
} from "@/lib/types";
import { cn, formatGoalText, formatShortWeek } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface ScorecardSectionProps {
  teamId: string;
  scorecard: ScorecardRead;
  canWrite: boolean;
  mode?: "team" | "meeting";
  onIssueFocused?: (issueId: string) => void;
}

export function ScorecardSection({
  teamId,
  scorecard,
  canWrite,
  mode = "team",
  onIssueFocused,
}: ScorecardSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");

  const saveScoreMutation = useMutation({
    mutationFn: async (params: {
      measurableId: string;
      weekStart: string;
      value: number;
      version: number | null;
    }) => {
      return apiRequest<ScoreCellRead>(
        `/api/teams/${teamId}/measurables/${params.measurableId}/scores/${params.weekStart}`,
        {
          method: "PUT",
          body: { value: params.value },
          ifMatchVersion: params.version,
        }
      );
    },
    onSuccess: () => {
      setEditingKey(null);
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-scorecard", teamId] });
      pushToast({ title: "Score saved", variant: "success" });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        pushToast({
          title: "Score updated by someone else",
          description: "Refreshed with the latest saved score. Please review before editing again.",
          variant: "warning",
        });
        setEditingKey(null);
        queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
        queryClient.invalidateQueries({ queryKey: ["team-scorecard", teamId] });
      } else {
        pushToast({
          title: "Could not save score",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "error",
        });
      }
    },
  });

  const makeIssueMutation = useMutation({
    mutationFn: async (params: { measurableId: string; weekStart: string }) => {
      return apiRequest<MakeIssueResult>(`/api/teams/${teamId}/issues/make-issue`, {
        method: "POST",
        body: {
          measurable_id: params.measurableId,
          week_start: params.weekStart,
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-issues", teamId] });
      onIssueFocused?.(res.data.issue.id);
      pushToast({
        title: res.data.created ? "Issue created from Scorecard" : "Existing unsolved Issue returned",
        description: res.data.issue.title,
        variant: res.data.created ? "success" : "default",
      });
    },
    onError: (err) => {
      pushToast({
        title: "Unable to create Issue",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "error",
      });
    },
  });

  const startEdit = (row: MeasurableRowRead, cell: ScoreCellRead) => {
    if (!canWrite) return;
    setEditingKey(`${row.id}:${cell.week_start}`);
    setDraftValue(cell.value !== null && cell.value !== undefined ? String(cell.value) : "");
  };

  const commitEdit = (measurableId: string, cell: ScoreCellRead) => {
    const trimmed = draftValue.trim();
    if (!trimmed) {
      setEditingKey(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      pushToast({
        title: "Invalid score",
        description: "Please enter a valid number.",
        variant: "error",
      });
      return;
    }
    saveScoreMutation.mutate({
      measurableId,
      weekStart: cell.week_start,
      value: parsed,
      version: cell.version,
    });
  };

  return (
    <Card className="overflow-hidden" data-testid="scorecard-section">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-teal-600" />
            <CardTitle>
              Scorecard {mode === "meeting" ? "· Review Last Closed Week" : "· 13-Week Trailing"}
            </CardTitle>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Last closed week:{" "}
            <span className="font-semibold text-slate-700">
              {formatShortWeek(scorecard.last_closed_week)}
            </span>{" "}
            · Current week:{" "}
            <span className="font-semibold text-slate-700">
              {formatShortWeek(scorecard.current_week)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="success">On Track</Badge>
          <Badge variant="danger">Off Track</Badge>
          <Badge variant="secondary">Pending</Badge>
          {!canWrite && <Badge variant="warning">Read-only Observer</Badge>}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-20 min-w-[180px] border-r border-slate-200 bg-slate-50 px-4 py-2.5">
                  Measurable
                </th>
                <th className="min-w-[110px] px-3 py-2.5">Owner</th>
                <th className="min-w-[90px] border-r border-slate-200 px-3 py-2.5">Goal</th>
                {scorecard.weeks.map((week) => {
                  const isLastClosed = week === scorecard.last_closed_week;
                  const isCurrent = week === scorecard.current_week;
                  return (
                    <th
                      key={week}
                      className={cn(
                        "min-w-[82px] px-2 py-2.5 text-center tabular-nums",
                        isLastClosed && "bg-teal-50/90 text-teal-900",
                        isCurrent && "bg-amber-50/60 text-amber-900"
                      )}
                    >
                      <div>{formatShortWeek(week)}</div>
                      {isLastClosed && (
                        <span className="mt-0.5 block text-[9px] font-bold text-teal-700">
                          CLOSED
                        </span>
                      )}
                      {isCurrent && (
                        <span className="mt-0.5 block text-[9px] font-bold text-amber-700">
                          NOW
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scorecard.measurables.map((row) => (
                <tr key={row.id} className="group hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-900 group-hover:bg-slate-50">
                    <div>{row.name}</div>
                    <div className="text-[11px] font-normal text-slate-400">{row.unit}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{row.owner_name}</td>
                  <td className="border-r border-slate-200 px-3 py-2.5 font-medium text-slate-700 tabular-nums">
                    {formatGoalText(row.goal, row.unit)}
                  </td>
                  {scorecard.weeks.map((week) => {
                    const cell = row.cells[week];
                    if (!cell) return <td key={week} className="px-2 py-2 text-center">—</td>;
                    const cellKey = `${row.id}:${week}`;
                    const isEditing = editingKey === cellKey;
                    const isLastClosed = week === scorecard.last_closed_week;

                    return (
                      <td
                        key={week}
                        className={cn(
                          "px-1.5 py-2 text-center align-middle tabular-nums",
                          isLastClosed && "bg-teal-50/30"
                        )}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              aria-label={`Edit ${row.name} score for ${week}`}
                              autoFocus
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  commitEdit(row.id, cell);
                                } else if (e.key === "Escape") {
                                  setEditingKey(null);
                                }
                              }}
                              onBlur={() => commitEdit(row.id, cell)}
                              className="h-7 w-16 rounded border border-teal-500 bg-white px-1.5 text-center text-xs font-semibold text-slate-900 focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              disabled={!canWrite}
                              onClick={() => startEdit(row, cell)}
                              title={
                                canWrite
                                  ? `Click to edit score (${cell.status})`
                                  : `Status: ${cell.status}`
                              }
                              className={cn(
                                "inline-flex min-w-[54px] items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-all",
                                cell.status === "on_track" &&
                                  "border-emerald-200 bg-emerald-50 text-emerald-800",
                                cell.status === "off_track" &&
                                  "border-rose-200 bg-rose-50 text-rose-800",
                                cell.status === "pending" &&
                                  "border-slate-200 bg-slate-100 text-slate-600",
                                canWrite
                                  ? "cursor-pointer hover:ring-2 hover:ring-teal-500/40"
                                  : "cursor-default"
                              )}
                            >
                              <span>{cell.value !== null ? cell.value : "—"}</span>
                              {canWrite && (
                                <Edit3 className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-60" />
                              )}
                            </button>

                            {cell.status === "off_track" && canWrite && (
                              <button
                                type="button"
                                onClick={() =>
                                  makeIssueMutation.mutate({
                                    measurableId: row.id,
                                    weekStart: week,
                                  })
                                }
                                title={
                                  cell.unsolved_issue_id
                                    ? "Open existing unsolved Issue"
                                    : "Make it an Issue"
                                }
                                data-testid={`make-issue-${row.id}-${week}`}
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer",
                                  cell.unsolved_issue_id
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                    : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                                )}
                              >
                                {cell.unsolved_issue_id ? (
                                  <>
                                    <Check className="h-2.5 w-2.5" />
                                    Issue
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    +Issue
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
