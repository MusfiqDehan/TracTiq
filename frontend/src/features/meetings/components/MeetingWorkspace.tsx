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
import { cn, formatChicagoTimestamp, formatShortWeek, formatTimerClock } from "@/lib/utils";
import { useTeamRealtime } from "@/lib/ws-client";
import { useAuth } from "@/features/auth/auth-context";
import { AppHeader } from "@/components/layout/AppHeader";
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

  const [auditOpen, setAuditOpen] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(null);
  const [endedSummary, setEndedSummary] = useState<MeetingSummaryRead | null>(null);
  const joinedMeetingIdRef = useRef<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["team-overview", teamId, user?.id],
    queryFn: async () => {
      const res = await apiRequest<TeamOverviewRead>(`/api/teams/${teamId}/overview`);
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
      : overviewQuery.data?.team.active_meeting ?? null;

  useEffect(() => {
    if (!activeMeeting || !user) return;
    const joinKey = `${activeMeeting.id}:${user.id}`;
    const alreadyIn = activeMeeting.attendees.some((a) => a.user_id === user.id);
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
      const res = await apiRequest<MeetingSummaryRead>(`/api/meetings/${meetingId}/summary`);
      setEndedSummary(res.data);
    } catch (err) {
      pushToast({
        title: "Could not load summary",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    }
  };

  if (overviewQuery.error instanceof ApiError && overviewQuery.error.status === 404) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader currentTeamId={teamId} />
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <Card>
            <CardContent className="space-y-4 p-8">
              <Badge variant="danger">404 · Access Restricted</Badge>
              <h1 className="text-2xl font-bold text-slate-900">Team Meeting Not Accessible</h1>
              <p className="text-sm text-slate-600">
                You do not belong to this team or it does not exist.
              </p>
              <Link href="/">
                <Button>Return Home</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const canWrite = overview?.team.can_write ?? false;
  const timer = liveTimer || activeMeeting?.timer;
  const isFacilitator = activeMeeting?.facilitator_id === user?.id;
  const myRating = activeMeeting?.ratings.find((r) => r.user_id === user?.id)?.rating ?? null;

  const meetingTodos =
    overview && activeMeeting
      ? overview.todos.items.filter(
          (t) =>
            t.created_in_meeting_id === activeMeeting.id ||
            activeMeeting.todos_created_ids.includes(t.id)
        )
      : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        currentTeamId={teamId}
        activeMeeting={activeMeeting}
        wsConnected={connected}
        onOpenAuditLog={() => setAuditOpen(true)}
      />

      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/teams/${teamId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {overview?.team.name || teamId} Workspace
          </Link>
        </div>

        {endedSummary ? (
          <MeetingSummaryView
            summary={endedSummary}
            onBackToTeam={() => setEndedSummary(null)}
          />
        ) : !overview ? (
          <Card>
            <CardContent className="p-12 text-center text-sm text-slate-500">
              Loading Level 10 Meeting workspace...
            </CardContent>
          </Card>
        ) : !activeMeeting ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Level 10 Meeting · {overview.team.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-slate-600">
                  No meeting is currently active for this team. Start a Level 10 Meeting to
                  sync Scorecard review (5m), IDS problem-solving (60m), and Conclude ratings
                  (10m) in real time across all teammates&apos; browsers.
                </p>
                {canWrite ? (
                  <Button
                    size="lg"
                    variant="accent"
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    data-testid="start-meeting-btn"
                  >
                    <Play className="h-4 w-4" />
                    {startMutation.isPending ? "Starting Meeting..." : "Start Level 10 Meeting"}
                  </Button>
                ) : (
                  <Badge variant="warning">
                    Observers can join once an Admin or Team Member starts the meeting.
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Past Meeting Summaries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {overview.ended_meetings.length === 0 ? (
                  <p className="text-sm text-slate-500">No ended meetings yet.</p>
                ) : (
                  overview.ended_meetings.map((mt) => (
                    <div
                      key={mt.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {formatChicagoTimestamp(mt.started_at)}
                        </p>
                        <p className="text-slate-500">
                          Facilitator: {mt.facilitator_name} · Rating:{" "}
                          <strong>{mt.rating !== null ? mt.rating.toFixed(1) : "—"}</strong>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
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
            {/* High-Contrast Sticky Meeting Control & Timer Bar */}
            <Card className="border-slate-800 bg-slate-900 text-white shadow-lg">
              <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
                {/* Agenda Progress */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="font-semibold text-teal-400">
                      {overview.team.name} · Level 10 Meeting
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                      Facilitator: <strong className="text-white">{activeMeeting.facilitator_name}</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2" data-testid="meeting-agenda">
                    {activeMeeting.agenda.map((sec, idx) => {
                      const isCurrent = activeMeeting.current_section === sec.key;
                      return (
                        <div
                          key={sec.key}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                            isCurrent
                              ? "border-teal-400 bg-teal-500/20 text-white ring-2 ring-teal-400/40"
                              : "border-white/10 bg-white/5 text-slate-400"
                          )}
                        >
                          <span>{idx + 1}. {sec.label}</span>
                          <span className="opacity-70">{Math.round(sec.duration_seconds / 60)}m</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Big Server-Owned Timer */}
                {timer && (
                  <div
                    data-testid="meeting-timer"
                    className={cn(
                      "flex items-center gap-4 rounded-xl border px-5 py-3",
                      timer.is_overtime
                        ? "animate-pulse border-rose-500 bg-rose-950/60 text-rose-200"
                        : "border-white/15 bg-white/5 text-white"
                    )}
                  >
                    <Clock className={cn("h-6 w-6", timer.is_overtime ? "text-rose-400" : "text-teal-400")} />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                        {timer.is_overtime ? "Over Time (No Auto-Advance)" : `${timer.section_label} Remaining`}
                      </div>
                      <div className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                        {timer.is_overtime
                          ? `+${formatTimerClock(timer.overtime_seconds)}`
                          : formatTimerClock(timer.remaining_seconds)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Attendees & Facilitator Controls */}
                <div className="flex flex-col items-start gap-2.5 lg:items-end">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    {activeMeeting.attendees.map((att) => (
                      <span
                        key={att.user_id}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          att.user_id === activeMeeting.facilitator_id
                            ? "bg-amber-400/20 text-amber-200 border border-amber-400/40"
                            : att.role === "observer"
                              ? "bg-slate-700 text-slate-300"
                              : "bg-white/10 text-white"
                        )}
                      >
                        {att.name.split(" ")[0]}
                        {att.role === "observer" && " (Obs)"}
                      </span>
                    ))}
                  </div>

                  {isFacilitator ? (
                    <div className="flex flex-wrap gap-2">
                      {activeMeeting.current_section !== "conclude" && (
                        <Button
                          size="sm"
                          variant="accent"
                          onClick={() => advanceMutation.mutate(activeMeeting.id)}
                          disabled={advanceMutation.isPending}
                          data-testid="advance-section-btn"
                        >
                          {activeMeeting.current_section === "scorecard"
                            ? "Advance to IDS"
                            : "Advance to Conclude"}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => endMutation.mutate(activeMeeting.id)}
                        disabled={endMutation.isPending}
                        data-testid="end-meeting-btn"
                      >
                        <Square className="h-3.5 w-3.5" />
                        End Meeting
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">
                      Only {activeMeeting.facilitator_name} can advance or end
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Section Body */}
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
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
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
                    <CardTitle>To-Dos Created This Meeting ({meetingTodos.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {meetingTodos.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Use &quot;Add To-Do&quot; on any Issue to create 7-day follow-ups.
                      </p>
                    ) : (
                      meetingTodos.map((td) => (
                        <div
                          key={td.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                        >
                          <p className="font-semibold text-slate-900">{td.title}</p>
                          <p className="mt-1 text-slate-500">
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
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Recap New To-Dos ({meetingTodos.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {meetingTodos.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No new To-Dos were created during this meeting.
                      </p>
                    ) : (
                      meetingTodos.map((td) => (
                        <div
                          key={td.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{td.title}</p>
                            <p className="text-xs text-slate-500">Owner: {td.owner_name}</p>
                          </div>
                          <Badge variant="secondary">Due {formatShortWeek(td.due_date)}</Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        <CardTitle>Meeting Rating (1–10)</CardTitle>
                      </div>
                      <Badge variant="accent">
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
                              "h-10 rounded-lg border text-sm font-bold transition-all cursor-pointer",
                              myRating === num
                                ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-700 hover:border-teal-400"
                            )}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="warning">
                        Observers attend meetings in read-only mode and do not submit ratings.
                      </Badge>
                    )}

                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Submitted Ratings
                      </p>
                      {activeMeeting.ratings.length === 0 ? (
                        <p className="text-xs text-slate-500">No ratings submitted yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {activeMeeting.ratings.map((rt) => (
                            <Badge key={rt.user_id} variant="secondary">
                              {rt.name}: <strong className="ml-1">{rt.rating}/10</strong>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>

      <AuditLogDrawer
        teamId={teamId}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
      />
    </div>
  );
}
