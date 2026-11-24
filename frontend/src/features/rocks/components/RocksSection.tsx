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
      return apiRequest<MakeIssueResult>(`/api/teams/${teamId}/issues/make-issue`, {
        method: "POST",
        body: { rock_id: rockId },
      });
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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-slate-700" />
            <CardTitle>Rocks · Current Quarter</CardTitle>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Read-only quarterly commitments and milestones
          </p>
        </div>
        <Badge variant="secondary">{rocks[0]?.quarter || "2026-Q4"}</Badge>
      </CardHeader>

      <CardContent className="space-y-2.5">
        {rocks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No Rocks found for this quarter.
          </p>
        ) : (
          rocks.map((rock) => {
            const isOpen = !!expanded[rock.id];
            const statusVariant =
              rock.status === "complete"
                ? "accent"
                : rock.status === "off_track"
                  ? "danger"
                  : "success";

            return (
              <div
                key={rock.id}
                data-testid={`rock-card-${rock.id}`}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => toggleRock(rock.id)}
                    className="flex flex-1 items-start gap-2.5 text-left cursor-pointer"
                  >
                    <span className="mt-0.5 text-slate-400">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{rock.title}</span>
                        <Badge variant={statusVariant}>
                          {rock.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>
                          Owner: <strong className="text-slate-700">{rock.owner_name}</strong>
                        </span>
                        <span>{rock.milestones.length} milestones</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                rock.status === "off_track"
                                  ? "bg-rose-500"
                                  : rock.status === "complete"
                                    ? "bg-teal-600"
                                    : "bg-emerald-500"
                              )}
                              style={{ width: `${rock.progress_percent}%` }}
                            />
                          </div>
                          <span className="font-semibold text-slate-700 tabular-nums">
                            {rock.progress_percent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {rock.status === "off_track" && canWrite && (
                    <Button
                      size="sm"
                      variant={rock.unsolved_issue_id ? "outline" : "destructive"}
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
                  <div className="border-t border-slate-100 bg-slate-50/70 px-10 py-3">
                    {rock.milestones.length === 0 ? (
                      <p className="text-xs text-slate-500">No milestones recorded.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {rock.milestones.map((ms) => (
                          <li
                            key={ms.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                                  ms.done
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : ms.is_past_due
                                      ? "border-rose-400 bg-rose-50 text-rose-600"
                                      : "border-slate-300 bg-white"
                                )}
                              >
                                {ms.done ? "✓" : ""}
                              </span>
                              <span
                                className={cn(
                                  ms.done ? "text-slate-500 line-through" : "font-medium text-slate-800"
                                )}
                              >
                                {ms.title}
                              </span>
                              {ms.is_past_due && <Badge variant="danger">Past due</Badge>}
                            </div>
                            <span className="text-slate-500 tabular-nums">
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
