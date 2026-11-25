"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { MakeIssueResult, RockRead } from "@/lib/types";
import { cn, formatShortWeek } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface RocksSectionProps {
  teamId: string;
  rocks: RockRead[];
  canWrite: boolean;
  onIssueFocused?: (issueId: string) => void;
}

export function RocksSection({
  teamId,
  rocks,
  canWrite,
  onIssueFocused,
}: RocksSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const makeIssueMutation = useMutation({
    mutationFn: async (rockId: string) => {
      return apiRequest<MakeIssueResult>(
        `/api/teams/${teamId}/issues/make-issue`,
        {
          method: "POST",
          body: { rock_id: rockId },
        }
      );
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-issues", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-rocks", teamId] });
      onIssueFocused?.(res.data.issue.id);
      pushToast({
        title: res.data.created
          ? "Issue created from off-track Rock"
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

  const toggleRock = (rockId: string) => {
    setExpanded((prev) => ({ ...prev, [rockId]: !prev[rockId] }));
  };

  return (
    <Card data-testid="rocks-section">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-[var(--accent-text)]" />
            <CardTitle>Rocks · Current Quarter</CardTitle>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Read-only quarterly commitments and milestones
          </p>
        </div>
        <Badge variant="neutral" className="tabular-nums">
          {rocks[0]?.quarter || "2026-Q4"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-2">
        {rocks.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-muted)]">
            No Rocks found for this quarter.
          </p>
        ) : (
          rocks.map((rock) => {
            const isOpen = Boolean(expanded[rock.id]);
            const statusVariant =
              rock.status === "complete"
                ? "brand"
                : rock.status === "off_track"
                  ? "off-track"
                  : "on-track";

            return (
              <div
                key={rock.id}
                data-testid={`rock-card-${rock.id}`}
                className="overflow-hidden rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)]"
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => toggleRock(rock.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-11 flex-1 items-start gap-3 text-left sm:min-h-0 cursor-pointer"
                  >
                    <span className="mt-0.5 text-[var(--text-muted)]">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {rock.title}
                        </span>
                        <Badge variant={statusVariant} dot>
                          {rock.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
                        <span>
                          Owner:{" "}
                          <strong className="font-semibold text-[var(--text-secondary)]">
                            {rock.owner_name}
                          </strong>
                        </span>
                        <span className="tabular-nums">
                          {rock.milestones.length} milestones
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-[4px] bg-[var(--bg-subtle)]">
                            <div
                              className={cn(
                                "h-full rounded-[4px] transition-all",
                                rock.status === "off_track"
                                  ? "bg-[var(--status-danger-solid)]"
                                  : rock.status === "complete"
                                    ? "bg-[var(--accent-primary)]"
                                    : "bg-[var(--status-on-track-dot)]"
                              )}
                              style={{ width: `${rock.progress_percent}%` }}
                            />
                          </div>
                          <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                            {rock.progress_percent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {rock.status === "off_track" && canWrite && (
                    <Button
                      size="sm"
                      variant={
                        rock.unsolved_issue_id ? "secondary" : "destructive"
                      }
                      onClick={() => makeIssueMutation.mutate(rock.id)}
                      className="shrink-0"
                    >
                      {rock.unsolved_issue_id ? (
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

                {isOpen && (
                  <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 sm:px-10">
                    {rock.milestones.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        No milestones recorded.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {rock.milestones.map((ms) => (
                          <li
                            key={ms.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-bold",
                                  ms.done
                                    ? "border-[var(--status-on-track-dot)] bg-[var(--status-on-track-dot)] text-[#f7f7f5]"
                                    : ms.is_past_due
                                      ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
                                      : "border-[var(--border-default)] bg-[var(--bg-elevated)]"
                                )}
                              >
                                {ms.done ? "✓" : ""}
                              </span>
                              <span
                                className={cn(
                                  ms.done
                                    ? "text-[var(--text-muted)] line-through"
                                    : "font-medium text-[var(--text-primary)]"
                                )}
                              >
                                {ms.title}
                              </span>
                              {ms.is_past_due && (
                                <Badge variant="off-track">Past due</Badge>
                              )}
                            </div>
                            <span className="shrink-0 text-[var(--text-muted)] tabular-nums">
                              {formatShortWeek(ms.due_date)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
