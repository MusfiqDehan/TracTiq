"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Crown,
  FileCheck2,
  Play,
  Square,
  Star,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  MeetingActiveRead,
  MeetingSummaryRead,
  TeamOverviewRead,
} from "@/lib/types";
import {
  cn,
  formatChicagoTimestamp,
  formatShortWeek,
  formatTimerClock,
} from "@/lib/utils";
import { useTeamRealtime } from "@/lib/ws-client";
import { useViewportTier } from "@/hooks/use-viewport-tier";
import { useAuth } from "@/features/auth/auth-context";
import { AppShell } from "@/components/layout/AppShell";
import { TracTiqLogo } from "@/components/brand/TracTiqLogo";
import { AuditLogDrawer } from "@/features/audit/components/AuditLogDrawer";
import { ScorecardSection } from "@/features/scorecard/components/ScorecardSection";
import { IssuesSection } from "@/features/issues/components/IssuesSection";
import { MeetingSummaryView } from "@/features/meetings/components/MeetingSummaryView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface MeetingWorkspaceProps {
  teamId: string;
}

export function MeetingWorkspace({ teamId }: MeetingWorkspaceProps) {
  const { user, accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const tier = useViewportTier();

  const [auditOpen, setAuditOpen] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(
    null
  );
  const [endedSummary, setEndedSummary] = useState<MeetingSummaryRead | null>(
    null
  );
  const joinedMeetingIdRef = useRef<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["team-overview", teamId, user?.id],
    queryFn: async () => {
      const res = await apiRequest<TeamOverviewRead>(
        `/api/teams/${teamId}/overview`
      );
      return res.data;
    },
    enabled: Boolean(user && accessToken),
  });

  const handleRealtimeEvent = useCallback(
    (eventType: string, payload: Record<string, unknown>) => {
      if (eventType === "MeetingEnded" && payload.summary) {
        setEndedSummary(payload.summary as MeetingSummaryRead);
        pushToast({ title: "Level 10 Meeting concluded", variant: "success" });
      }
    },
    [pushToast]
  );

  const { connected, liveTimer, liveMeeting } = useTeamRealtime(
    teamId,
    accessToken,
    handleRealtimeEvent
  );

  const activeMeeting =
    liveMeeting !== undefined
      ? liveMeeting
      : (overviewQuery.data?.team.active_meeting ?? null);

  useEffect(() => {
    if (!activeMeeting || !user) return;
    const joinKey = `${activeMeeting.id}:${user.id}`;
    const alreadyIn = activeMeeting.attendees.some(
      (a) => a.user_id === user.id
    );
    if (!alreadyIn && joinedMeetingIdRef.current !== joinKey) {
      joinedMeetingIdRef.current = joinKey;
      apiRequest<MeetingActiveRead>(`/api/meetings/${activeMeeting.id}/join`, {
        method: "POST",
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
        })
        .catch(() => {});
    }
  }, [activeMeeting, user, teamId, queryClient]);

  const startMutation = useMutation({
    mutationFn: () =>
      apiRequest<MeetingActiveRead>(`/api/teams/${teamId}/meetings/start`, {
        method: "POST",
      }),
    onSuccess: () => {
      setEndedSummary(null);
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      pushToast({ title: "Level 10 Meeting started", variant: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Cannot start meeting",
        description: err instanceof Error ? err.message : "Conflict",
        variant: "error",
      });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: (meetingId: string) =>
      apiRequest<MeetingActiveRead>(`/api/meetings/${meetingId}/advance`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
    },
    onError: (err) => {
      pushToast({
        title: "Cannot advance section",
        description: err instanceof Error ? err.message : "Forbidden",
        variant: "error",
      });
    },
  });

  const rateMutation = useMutation({
    mutationFn: (params: { meetingId: string; rating: number }) =>
      apiRequest<MeetingActiveRead>(`/api/meetings/${params.meetingId}/rate`, {
        method: "POST",
        body: { rating: params.rating },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      pushToast({ title: "Rating saved", variant: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Rating rejected",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    },
  });

  const endMutation = useMutation({
    mutationFn: (meetingId: string) =>
      apiRequest<MeetingSummaryRead>(`/api/meetings/${meetingId}/end`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      setEndedSummary(res.data);
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
    },
    onError: (err) => {
      pushToast({
        title: "Cannot end meeting",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    },
  });

  const openHistoricalSummary = async (meetingId: string) => {
    try {
      const res = await apiRequest<MeetingSummaryRead>(
        `/api/meetings/${meetingId}/summary`
      );
      setEndedSummary(res.data);
    } catch (err) {
      pushToast({
        title: "Could not load summary",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    }
  };

  if (
    overviewQuery.error instanceof ApiError &&
    overviewQuery.error.status === 404
  ) {
    return (
      <AppShell currentTeamId={teamId}>
        <div className="mx-auto max-w-lg py-12 text-center">
          <Card data-testid="team-access-denied">
            <CardContent className="flex flex-col items-center gap-4 p-8">
              <Link href="/" aria-label="TracTiq Home" className="inline-flex rounded-[8px]">
                <TracTiqLogo variant="mark" size="lg" />
              </Link>
              <Badge variant="off-track" dot>
                404 · Access Restricted
              </Badge>
              <h1 className="type-h1 text-[var(--text-primary)]">
                Team Meeting Not Accessible
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                You do not belong to this team or it does not exist.
              </p>
              <Link href="/">
                <Button variant="primary">Switch Account</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const overview = overviewQuery.data;
  const canWrite = overview?.team.can_write ?? false;
  const timer = liveTimer || activeMeeting?.timer;
  const isFacilitator = activeMeeting?.facilitator_id === user?.id;
  const myRating =
    activeMeeting?.ratings.find((r) => r.user_id === user?.id)?.rating ?? null;

  const meetingTodos =
    overview && activeMeeting
      ? overview.todos.items.filter(
          (t) =>
            t.created_in_meeting_id === activeMeeting.id ||
            activeMeeting.todos_created_ids.includes(t.id)
        )
      : [];

  const renderFacilitatorControls = (fullWidth = false) => {
    if (!activeMeeting || !isFacilitator) return null;
    return (
      <div className={cn("flex items-center gap-2", fullWidth && "w-full")}>
        {activeMeeting.current_section !== "conclude" && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => advanceMutation.mutate(activeMeeting.id)}
            disabled={advanceMutation.isPending}
            data-testid="advance-section-btn"
            className={fullWidth ? "flex-1" : undefined}
          >
            <span>
              {activeMeeting.current_section === "scorecard"
                ? "Advance to IDS"
                : "Advance to Conclude"}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive-solid"
          onClick={() => endMutation.mutate(activeMeeting.id)}
          disabled={endMutation.isPending}
          data-testid="end-meeting-btn"
          className={fullWidth ? "shrink-0" : undefined}
        >
          <Square className="h-3.5 w-3.5" />
          <span>End Meeting</span>
        </Button>
      </div>
    );
  };

  return (
    <AppShell
      currentTeamId={teamId}
      activeMeeting={activeMeeting}
      wsConnected={connected}
      onOpenAuditLog={() => setAuditOpen(true)}
      forceCollapsedRail={Boolean(activeMeeting)}
      mobileBottomPaddingExtra={Boolean(activeMeeting && isFacilitator)}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/teams/${teamId}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] px-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to {overview?.team.name || teamId} Workspace</span>
          </Link>
        </div>

        {endedSummary ? (
          <MeetingSummaryView
            summary={endedSummary}
            onBackToTeam={() => setEndedSummary(null)}
          />
        ) : !overview ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <TracTiqLogo variant="mark" size="md" />
              <p className="text-sm font-medium text-[var(--text-muted)]">
                Loading Level 10 Meeting workspace...
              </p>
            </CardContent>
          </Card>
        ) : !activeMeeting ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Level 10 Meeting · {overview.team.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-[var(--text-secondary)]">
                  No meeting is currently active for this team. Start a Level 10
                  Meeting to sync Scorecard review (5m), IDS problem-solving
                  (60m), and Conclude ratings (10m) in real time across all
                  teammates&apos; browsers.
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { num: "1", label: "Scorecard", dur: "5 min" },
                    { num: "2", label: "IDS", dur: "60 min" },
                    { num: "3", label: "Conclude", dur: "10 min" },
                  ].map((step) => (
                    <div
                      key={step.num}
                      className="flex items-center justify-between rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-[var(--text-primary)]">
                        {step.num}. {step.label}
                      </span>
                      <span className="font-semibold text-[var(--accent-text)] tabular-nums">
                        {step.dur}
                      </span>
                    </div>
                  ))}
                </div>

                {canWrite ? (
                  <Button
                    size="lg"
                    variant="primary"
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    data-testid="start-meeting-btn"
                  >
                    <Play className="h-4 w-4" />
                    {startMutation.isPending
                      ? "Starting Meeting..."
                      : "Start Level 10 Meeting"}
                  </Button>
                ) : (
                  <Badge variant="warning">
                    Observers can join once an Admin or Team Member starts the
                    meeting.
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Past Meeting Summaries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overview.ended_meetings.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No ended meetings yet.
                  </p>
                ) : (
                  overview.ended_meetings.map((mt) => (
                    <div
                      key={mt.id}
                      className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                          {formatChicagoTimestamp(mt.started_at)}
                        </p>
                        <p className="mt-0.5 text-[var(--text-secondary)] tabular-nums">
                          Facilitator: {mt.facilitator_name} · Rating:{" "}
                          <strong className="font-semibold text-[var(--text-primary)]">
                            {mt.rating !== null ? mt.rating.toFixed(1) : "—"}
                          </strong>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openHistoricalSummary(mt.id)}
                        data-testid={`view-summary-${mt.id}`}
                      >
                        <FileCheck2 className="h-3.5 w-3.5" />
                        Summary
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-5">
            {/* True Sticky Compact L10 Meeting HUD */}
            <div className="sticky top-[57px] z-20 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {/* Agenda & Facilitator Meta */}
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-bold text-[var(--accent-text)]">
                      {overview.team.name} · Level 10
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Crown className="h-3.5 w-3.5 text-[var(--status-warning-dot)]" />
                      Facilitator:{" "}
                      <strong className="font-semibold text-[var(--text-primary)]">
                        {activeMeeting.facilitator_name}
                      </strong>
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    data-testid="meeting-agenda"
                  >
                    {activeMeeting.agenda.map((sec, idx) => {
                      const isCurrent =
                        activeMeeting.current_section === sec.key;
                      return (
                        <div
                          key={sec.key}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors",
                            isCurrent
                              ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[#f7f7f5]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                          )}
                        >
                          <span>
                            {idx + 1}. {sec.label}
                          </span>
                          <span className="opacity-80">
                            {Math.round(sec.duration_seconds / 60)}m
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* High-Readability Server-Owned Timer */}
                {timer && (
                  <div
                    data-testid="meeting-timer"
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-[8px] border px-4 py-2 sm:justify-start",
                      timer.is_overtime
                        ? "border-[var(--status-danger-solid)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
                        : "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                    )}
                  >
                    <Clock
                      className={cn(
                        "h-5 w-5 shrink-0",
                        timer.is_overtime
                          ? "text-[var(--status-danger-text)]"
                          : "text-[var(--accent-text)]"
                      )}
                    />
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] opacity-85">
                        {timer.is_overtime
                          ? "Over time · No auto-advance"
                          : `${timer.section_label} Remaining`}
                      </div>
                      <div className="type-display leading-none tabular-nums">
                        {timer.is_overtime
                          ? `+${formatTimerClock(timer.overtime_seconds)}`
                          : formatTimerClock(timer.remaining_seconds)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Attendees & Desktop/Tablet Facilitator Controls (Single-Mount) */}
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    {activeMeeting.attendees.map((att) => (
                      <Badge
                        key={att.user_id}
                        variant={
                          att.user_id === activeMeeting.facilitator_id
                            ? "brand"
                            : att.role === "observer"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {att.name.split(" ")[0]}
                        {att.role === "observer" && " (Obs)"}
                      </Badge>
                    ))}
                  </div>

                  {tier !== "mobile" &&
                    (isFacilitator ? (
                      renderFacilitatorControls(false)
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">
                        Only {activeMeeting.facilitator_name} can advance or end
                      </span>
                    ))}
                </div>
              </div>
            </div>

            {/* Section Body (Reuses Shared ScorecardSection & IssuesSection) */}
            {activeMeeting.current_section === "scorecard" && (
              <ScorecardSection
                teamId={teamId}
                scorecard={overview.scorecard}
                canWrite={canWrite}
                mode="meeting"
                onIssueFocused={(id) => {
                  setHighlightedIssueId(id);
                  pushToast({
                    title: "Issue ready for IDS",
                    description: "Switch to IDS to solve this Issue.",
                  });
                }}
              />
            )}

            {activeMeeting.current_section === "ids" && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <IssuesSection
                    teamId={teamId}
                    unsolvedIssues={overview.unsolved_issues}
                    eligibleOwners={overview.team.eligible_owners}
                    canWrite={canWrite}
                    mode="meeting"
                    highlightedIssueId={highlightedIssueId}
                  />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="tabular-nums">
                      To-Dos Created This Meeting ({meetingTodos.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {meetingTodos.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        Use &quot;Add To-Do&quot; on any Issue to create 7-day
                        follow-ups.
                      </p>
                    ) : (
                      meetingTodos.map((td) => (
                        <div
                          key={td.id}
                          className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-xs"
                        >
                          <p className="font-semibold text-[var(--text-primary)]">
                            {td.title}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)] tabular-nums">
                            {td.owner_name} · Due {formatShortWeek(td.due_date)}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeMeeting.current_section === "conclude" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="tabular-nums">
                      Recap New To-Dos ({meetingTodos.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {meetingTodos.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        No new To-Dos were created during this meeting.
                      </p>
                    ) : (
                      meetingTodos.map((td) => (
                        <div
                          key={td.id}
                          className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--text-primary)]">
                              {td.title}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Owner: {td.owner_name}
                            </p>
                          </div>
                          <Badge variant="neutral" className="shrink-0">
                            Due {formatShortWeek(td.due_date)}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-[var(--status-warning-dot)]" />
                        <CardTitle>Meeting Rating (1–10)</CardTitle>
                      </div>
                      <Badge variant="brand">
                        Avg:{" "}
                        {activeMeeting.average_rating !== null
                          ? activeMeeting.average_rating.toFixed(1)
                          : "—"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {canWrite ? (
                      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() =>
                              rateMutation.mutate({
                                meetingId: activeMeeting.id,
                                rating: num,
                              })
                            }
                            data-testid={`rate-btn-${num}`}
                            className={cn(
                              "h-11 rounded-[8px] border text-sm font-bold tabular-nums transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
                              myRating === num
                                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[#f7f7f5]"
                                : "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-focus)] hover:bg-[var(--bg-hover)]"
                            )}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="warning">
                        Observers attend meetings in read-only mode and do not
                        submit ratings.
                      </Badge>
                    )}

                    <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                        Submitted Ratings
                      </p>
                      {activeMeeting.ratings.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          No ratings submitted yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {activeMeeting.ratings.map((rt) => (
                            <Badge key={rt.user_id} variant="neutral">
                              {rt.name}:{" "}
                              <strong className="font-bold text-[var(--text-primary)]">
                                {rt.rating}/10
                              </strong>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Mobile Docked Facilitator Action Bar (Single-Mount when tier === "mobile") */}
            {tier === "mobile" && isFacilitator && (
              <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom,0px))] z-20 border-t border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-2">
                {renderFacilitatorControls(true)}
              </div>
            )}
          </div>
        )}
      </div>

      <AuditLogDrawer
        teamId={teamId}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
      />
    </AppShell>
  );
}
