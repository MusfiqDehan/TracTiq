"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Target,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  MakeIssueResult,
  MeasurableRowRead,
  ScorecardRead,
  ScoreCellRead,
} from "@/lib/types";
import { cn, formatGoalText, formatShortWeek } from "@/lib/utils";
import { useViewportTier } from "@/hooks/use-viewport-tier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

interface ScorecardSectionProps {
  teamId: string;
  scorecard: ScorecardRead;
  canWrite: boolean;
  mode?: "team" | "meeting";
  onIssueFocused?: (issueId: string) => void;
}

const TABLET_WINDOW_SIZE = 4;

export function ScorecardSection({
  teamId,
  scorecard,
  canWrite,
  mode = "team",
  onIssueFocused,
}: ScorecardSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const tier = useViewportTier();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");

  // Mobile selected week defaults to last_closed_week
  const [mobileWeekOverride, setMobileWeekOverride] = useState<string | null>(
    null
  );
  const selectedMobileWeek =
    mobileWeekOverride && scorecard.weeks.includes(mobileWeekOverride)
      ? mobileWeekOverride
      : scorecard.weeks.includes(scorecard.last_closed_week)
        ? scorecard.last_closed_week
        : (scorecard.weeks[scorecard.weeks.length - 1] ?? "");

  const mobileWeekIndex = Math.max(
    0,
    scorecard.weeks.indexOf(selectedMobileWeek)
  );

  // Tablet 4-week window (defaulting to the 4 most recent weeks) + 13w toggle
  const maxTabletStart = Math.max(
    0,
    scorecard.weeks.length - TABLET_WINDOW_SIZE
  );
  const [tabletMode, setTabletMode] = useState<"4w" | "13w">("4w");
  const [tabletWindowStart, setTabletWindowStart] = useState<number | null>(
    null
  );
  const effectiveTabletStart =
    tabletWindowStart === null
      ? maxTabletStart
      : Math.min(Math.max(0, tabletWindowStart), maxTabletStart);

  const visibleTableWeeks = useMemo(() => {
    if (tier === "tablet" && tabletMode === "4w") {
      return scorecard.weeks.slice(
        effectiveTabletStart,
        effectiveTabletStart + TABLET_WINDOW_SIZE
      );
    }
    return scorecard.weeks;
  }, [tier, tabletMode, scorecard.weeks, effectiveTabletStart]);

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
          description:
            "Refreshed with the latest saved score. Please review before editing again.",
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
      return apiRequest<MakeIssueResult>(
        `/api/teams/${teamId}/issues/make-issue`,
        {
          method: "POST",
          body: {
            measurable_id: params.measurableId,
            week_start: params.weekStart,
          },
        }
      );
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-issues", teamId] });
      onIssueFocused?.(res.data.issue.id);
      pushToast({
        title: res.data.created
          ? "Issue created from Scorecard"
          : "Existing unsolved Issue returned",
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
    setDraftValue(
      cell.value !== null && cell.value !== undefined ? String(cell.value) : ""
    );
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

  const getCellTone = (status: ScoreCellRead["status"]) => {
    if (status === "on_track") {
      return "border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] text-[var(--status-on-track-text)]";
    }
    if (status === "off_track") {
      return "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]";
    }
    return "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]";
  };

  return (
    <Card className="overflow-hidden" data-testid="scorecard-section">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--accent-text)]" />
            <CardTitle>
              Scorecard{" "}
              {mode === "meeting"
                ? "· Review Last Closed Week"
                : "· 13-Week Trailing"}
            </CardTitle>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
            Last closed week:{" "}
            <strong className="font-semibold text-[var(--text-primary)]">
              {formatShortWeek(scorecard.last_closed_week)}
            </strong>{" "}
            · Current week:{" "}
            <strong className="font-semibold text-[var(--text-primary)]">
              {formatShortWeek(scorecard.current_week)}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tier === "tablet" && (
            <SegmentedControl
              value={tabletMode}
              onChange={setTabletMode}
              size="sm"
              ariaLabel="Scorecard week view mode"
              options={[
                { value: "4w", label: "4w Focus" },
                { value: "13w", label: "All 13w" },
              ]}
            />
          )}
          <Badge variant="on-track" dot>
            On Track
          </Badge>
          <Badge variant="off-track" dot>
            Off Track
          </Badge>
          <Badge variant="neutral">Pending</Badge>
          {!canWrite && <Badge variant="warning">Read-only Observer</Badge>}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {tier === "mobile" ? (
          /* Mobile (<640px): Zero Horizontal Scroll Week-Focused Cards + 13-Week Status Strip */
          <div className="divide-y divide-[var(--border-subtle)]">
            <div className="flex flex-col gap-3 bg-[var(--bg-subtle)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Previous week"
                  disabled={mobileWeekIndex <= 0}
                  onClick={() =>
                    setMobileWeekOverride(scorecard.weeks[mobileWeekIndex - 1])
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                      Week of {formatShortWeek(selectedMobileWeek)}
                    </span>
                    {selectedMobileWeek === scorecard.last_closed_week && (
                      <Badge variant="brand">CLOSED</Badge>
                    )}
                    {selectedMobileWeek === scorecard.current_week && (
                      <Badge variant="warning">NOW</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)] tabular-nums">
                    Week {mobileWeekIndex + 1} of {scorecard.weeks.length}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Next week"
                  disabled={mobileWeekIndex >= scorecard.weeks.length - 1}
                  onClick={() =>
                    setMobileWeekOverride(scorecard.weeks[mobileWeekIndex + 1])
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    selectedMobileWeek === scorecard.last_closed_week
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() =>
                    setMobileWeekOverride(scorecard.last_closed_week)
                  }
                  className="flex-1"
                >
                  Last Closed ({formatShortWeek(scorecard.last_closed_week)})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    selectedMobileWeek === scorecard.current_week
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() => setMobileWeekOverride(scorecard.current_week)}
                  className="flex-1"
                >
                  Current ({formatShortWeek(scorecard.current_week)})
                </Button>
              </div>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {scorecard.measurables.map((row) => {
                const cell = row.cells[selectedMobileWeek];
                const cellKey = `${row.id}:${selectedMobileWeek}`;
                const isEditing = editingKey === cellKey;

                return (
                  <div key={row.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                          {row.name}
                        </h4>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {row.owner_name} · Unit: {row.unit}
                        </p>
                      </div>
                      <Badge variant="neutral" className="shrink-0 tabular-nums">
                        Goal {formatGoalText(row.goal, row.unit)}
                      </Badge>
                    </div>

                    {cell && (
                      <div className="flex flex-wrap items-center gap-2">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            aria-label={`Edit ${row.name} score for ${selectedMobileWeek}`}
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
                            className="h-11 w-28 rounded-[8px] border-2 border-[var(--border-focus)] bg-[var(--bg-elevated)] px-3 text-center text-base font-bold text-[var(--text-primary)] tabular-nums focus:outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => startEdit(row, cell)}
                            className={cn(
                              "inline-flex h-11 min-w-[112px] items-center justify-center gap-2 rounded-[8px] border px-4 text-sm font-bold tabular-nums transition-colors",
                              getCellTone(cell.status),
                              canWrite
                                ? "cursor-pointer hover:border-[var(--border-focus)]"
                                : "cursor-default"
                            )}
                          >
                            <span>
                              {cell.value !== null ? cell.value : "—"}
                            </span>
                            {canWrite && (
                              <Edit3
                                className="h-3.5 w-3.5 opacity-70"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        )}

                        {cell.status === "off_track" && canWrite && (
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              cell.unsolved_issue_id
                                ? "secondary"
                                : "destructive"
                            }
                            onClick={() =>
                              makeIssueMutation.mutate({
                                measurableId: row.id,
                                weekStart: selectedMobileWeek,
                              })
                            }
                            data-testid={`make-issue-${row.id}-${selectedMobileWeek}`}
                          >
                            {cell.unsolved_issue_id ? (
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
                    )}

                    {/* Tappable 13-Week Trailing Health Strip */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
                        <span>13-week trend (tap any week)</span>
                        <span className="tabular-nums">
                          {formatShortWeek(scorecard.weeks[0])} –{" "}
                          {formatShortWeek(
                            scorecard.weeks[scorecard.weeks.length - 1]
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-13 gap-1">
                        {scorecard.weeks.map((wk) => {
                          const wkCell = row.cells[wk];
                          const isSelected = wk === selectedMobileWeek;
                          return (
                            <button
                              key={wk}
                              type="button"
                              aria-label={`Select week ${formatShortWeek(wk)} for ${row.name}`}
                              title={`${formatShortWeek(wk)}: ${wkCell?.value ?? "—"} (${wkCell?.status ?? "pending"})`}
                              onClick={() => setMobileWeekOverride(wk)}
                              className={cn(
                                "flex h-8 items-center justify-center rounded-[4px] border transition-colors cursor-pointer",
                                isSelected
                                  ? "border-[var(--accent-primary)] bg-[var(--accent-subtle)]"
                                  : "border-transparent bg-[var(--bg-subtle)]"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-2.5 w-2.5 rounded-[2px]",
                                  wkCell?.status === "on_track" &&
                                    "bg-[var(--status-on-track-dot)]",
                                  wkCell?.status === "off_track" &&
                                    "bg-[var(--status-danger-solid)]",
                                  (!wkCell || wkCell.status === "pending") &&
                                    "bg-[var(--border-strong)]"
                                )}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Tablet (4w Focus / All 13w) & Desktop (Full 13-Week Matrix) */
          <div>
            {tier === "tablet" && tabletMode === "4w" && (
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-2 text-xs">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={effectiveTabletStart <= 0}
                  onClick={() =>
                    setTabletWindowStart(
                      Math.max(0, effectiveTabletStart - TABLET_WINDOW_SIZE)
                    )
                  }
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Older 4w
                </Button>
                <span className="font-semibold text-[var(--text-secondary)] tabular-nums">
                  Showing {formatShortWeek(visibleTableWeeks[0])} –{" "}
                  {formatShortWeek(
                    visibleTableWeeks[visibleTableWeeks.length - 1]
                  )}{" "}
                  (of {scorecard.weeks.length} weeks)
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={effectiveTabletStart >= maxTabletStart}
                  onClick={() =>
                    setTabletWindowStart(
                      Math.min(
                        maxTabletStart,
                        effectiveTabletStart + TABLET_WINDOW_SIZE
                      )
                    )
                  }
                >
                  Newer 4w
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 min-w-[152px] border-r border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2.5">
                      Measurable
                    </TableHead>
                    <TableHead className="min-w-[96px]">Owner</TableHead>
                    <TableHead className="min-w-[78px] border-r border-[var(--border-default)]">
                      Goal
                    </TableHead>
                    {visibleTableWeeks.map((week) => {
                      const isLastClosed = week === scorecard.last_closed_week;
                      const isCurrent = week === scorecard.current_week;
                      return (
                        <TableHead
                          key={week}
                          className={cn(
                            "min-w-[66px] px-1.5 py-2 text-center tabular-nums",
                            isLastClosed &&
                              "bg-[var(--accent-subtle)] text-[var(--accent-text)]",
                            isCurrent &&
                              "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
                          )}
                        >
                          <div>{formatShortWeek(week)}</div>
                          {isLastClosed && (
                            <span className="mt-0.5 block text-[10px] font-bold tracking-[0.04em]">
                              CLOSED
                            </span>
                          )}
                          {isCurrent && (
                            <span className="mt-0.5 block text-[10px] font-bold tracking-[0.04em]">
                              NOW
                            </span>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {scorecard.measurables.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="sticky left-0 z-10 border-r border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-3 font-semibold text-[var(--text-primary)] group-hover:bg-[var(--bg-hover)]">
                        <div>{row.name}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                          {row.unit}
                        </div>
                      </TableCell>
                      <TableCell className="text-[var(--text-secondary)]">
                        {row.owner_name}
                      </TableCell>
                      <TableCell className="border-r border-[var(--border-default)] font-semibold text-[var(--text-primary)] tabular-nums">
                        {formatGoalText(row.goal, row.unit)}
                      </TableCell>
                      {visibleTableWeeks.map((week) => {
                        const cell = row.cells[week];
                        if (!cell) {
                          return (
                            <TableCell
                              key={week}
                              className="px-2 py-2 text-center text-[var(--text-muted)]"
                            >
                              —
                            </TableCell>
                          );
                        }

                        const cellKey = `${row.id}:${week}`;
                        const isEditing = editingKey === cellKey;
                        const isLastClosed =
                          week === scorecard.last_closed_week;

                        return (
                          <TableCell
                            key={week}
                            className={cn(
                              "px-1 py-2 text-center align-middle tabular-nums",
                              isLastClosed && "bg-[var(--accent-subtle)]/35"
                            )}
                          >
                            {isEditing ? (
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
                                className="h-8 w-16 rounded-[4px] border-2 border-[var(--border-focus)] bg-[var(--bg-elevated)] px-1.5 text-center text-xs font-bold text-[var(--text-primary)] tabular-nums focus:outline-none"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() => startEdit(row, cell)}
                                  title={
                                    canWrite
                                      ? `Click to edit score (${cell.status.replace("_", " ")})`
                                      : `Status: ${cell.status.replace("_", " ")}`
                                  }
                                  className={cn(
                                    "inline-flex h-8 min-w-[50px] items-center justify-center gap-1 rounded-[4px] border px-1.5 text-xs font-semibold tabular-nums transition-colors",
                                    getCellTone(cell.status),
                                    canWrite
                                      ? "cursor-pointer hover:border-[var(--border-focus)]"
                                      : "cursor-default"
                                  )}
                                >
                                  <span>
                                    {cell.value !== null ? cell.value : "—"}
                                  </span>
                                  {canWrite && (
                                    <Edit3
                                      className="h-2.5 w-2.5 opacity-45"
                                      aria-hidden="true"
                                    />
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
                                      "inline-flex h-6 items-center gap-1 rounded-[4px] border px-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
                                      cell.unsolved_issue_id
                                        ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] hover:border-[var(--border-strong)]"
                                        : "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] hover:bg-[var(--status-danger-solid)] hover:text-[#f7f7f5]"
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
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
