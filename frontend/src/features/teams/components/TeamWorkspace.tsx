"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckSquare,
  Eye,
  FileCheck2,
  Flag,
  Radio,
  Target,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  MeetingActiveRead,
  MeetingSummaryRead,
  TeamOverviewRead,
} from "@/lib/types";
import { cn, formatChicagoTimestamp } from "@/lib/utils";
import { useTeamRealtime } from "@/lib/ws-client";
import { useAuth } from "@/features/auth/auth-context";
import { AppShell } from "@/components/layout/AppShell";
import { TracTiqLogo } from "@/components/brand/TracTiqLogo";
import { AuditLogDrawer } from "@/features/audit/components/AuditLogDrawer";
import { ScorecardSection } from "@/features/scorecard/components/ScorecardSection";
import { IssuesSection } from "@/features/issues/components/IssuesSection";
import { TodosSection } from "@/features/todos/components/TodosSection";
import { RocksSection } from "@/features/rocks/components/RocksSection";
import { MeetingSummaryView } from "@/features/meetings/components/MeetingSummaryView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

interface TeamWorkspaceProps {
  teamId: string;
}

export function TeamWorkspace({ teamId }: TeamWorkspaceProps) {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [auditOpen, setAuditOpen] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(
    null
  );
  const [selectedSummary, setSelectedSummary] =
    useState<MeetingSummaryRead | null>(null);

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

  const { connected, liveMeeting } = useTeamRealtime(teamId, accessToken);

  const startMeetingMutation = useMutation({
    mutationFn: () =>
      apiRequest<MeetingActiveRead>(`/api/teams/${teamId}/meetings/start`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview", teamId] });
      router.push(`/teams/${teamId}/meeting`);
    },
    onError: (err) => {
      pushToast({
        title: "Could not start meeting",
        description: err instanceof Error ? err.message : "Error",
        variant: "error",
      });
    },
  });

  const focusIssue = (issueId: string) => {
    setHighlightedIssueId(issueId);
    setTimeout(() => {
      setHighlightedIssueId((curr) => (curr === issueId ? null : curr));
    }, 5000);
  };

  const scrollToSection = (sectionId: string) => {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openMeetingSummary = async (meetingId: string) => {
    try {
      const res = await apiRequest<MeetingSummaryRead>(
        `/api/meetings/${meetingId}/summary`
      );
      setSelectedSummary(res.data);
    } catch (err) {
      pushToast({
        title: "Failed to load summary",
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
                Team Not Found or Restricted
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Server authorization confirmed your current account ({user?.name}
                ) does not have access to team{" "}
                <strong className="font-semibold text-[var(--text-primary)] tabular-nums">
                  {teamId}
                </strong>
                .
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {user && user.teams.length > 0 && (
                  <Link href={`/teams/${user.teams[0].id}`}>
                    <Button variant="primary">
                      Go to {user.teams[0].name}
                    </Button>
                  </Link>
                )}
                <Link href="/">
                  <Button variant="secondary">Switch Account</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const overview = overviewQuery.data;
  const activeMeeting =
    liveMeeting !== undefined
      ? liveMeeting
      : (overview?.team.active_meeting ?? null);

  const offTrackMeasurablesCount = overview
    ? overview.scorecard.measurables.filter(
        (m) => m.cells[overview.scorecard.last_closed_week]?.status === "off_track"
      ).length
    : 0;
  const overdueTodosCount = overview
    ? overview.todos.items.filter((t) => t.is_overdue).length
    : 0;
  const offTrackRocksCount = overview
    ? overview.rocks.filter((r) => r.status === "off_track").length
    : 0;

  return (
    <AppShell
      currentTeamId={teamId}
      activeMeeting={activeMeeting}
      wsConnected={connected}
      onStartMeeting={() => startMeetingMutation.mutate()}
      startingMeeting={startMeetingMutation.isPending}
      onOpenAuditLog={() => setAuditOpen(true)}
    >
      <div className="space-y-6">
        {!overview ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <TracTiqLogo variant="mark" size="md" />
              <p className="text-sm font-medium text-[var(--text-muted)]">
                Loading team workspace...
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Observer Read-Only Clarity Banner */}
            {!overview.team.can_write && (
              <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-xs text-[var(--status-warning-text)] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Eye className="h-4 w-4 shrink-0" />
                  <span>
                    Viewing as read-only Observer — inspect team data and join
                    Level 10 Meetings, or switch accounts to edit.
                  </span>
                </div>
                <Link href="/" className="shrink-0">
                  <Button size="sm" variant="secondary">
                    Switch Account
                  </Button>
                </Link>
              </div>
            )}

            {/* Focused Team Header + Pre-Meeting Health Strip */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <h1 className="type-h1 text-[var(--text-primary)]">
                  {overview.team.name} Team
                </h1>
                <p className="text-xs text-[var(--text-muted)] tabular-nums">
                  {overview.team.company_timezone} · Today:{" "}
                  {overview.team.today}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollToSection("workspace-scorecard")}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-xs font-semibold tabular-nums transition-colors cursor-pointer",
                    offTrackMeasurablesCount > 0
                      ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] hover:border-[var(--status-danger-solid)]"
                      : "border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] text-[var(--status-on-track-text)]"
                  )}
                >
                  <Target className="h-3.5 w-3.5" />
                  <span>{offTrackMeasurablesCount} Off-track</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection("workspace-issues")}
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] tabular-nums transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-[var(--status-danger-text)]" />
                  <span>{overview.unsolved_issues.length} Issues</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection("workspace-todos")}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-xs font-semibold tabular-nums transition-colors cursor-pointer",
                    overdueTodosCount > 0
                      ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
                      : "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  )}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>{overdueTodosCount} Overdue To-Dos</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection("workspace-rocks")}
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] tabular-nums transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <Flag className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                  <span>{offTrackRocksCount} Off-track Rocks</span>
                </button>

                {/* Observers don't have Start L10 in the top bar; give them a clean room link when idle */}
                {!overview.team.can_write && !activeMeeting && (
                  <Link href={`/teams/${teamId}/meeting`}>
                    <Button variant="secondary" size="sm">
                      <Radio className="h-3.5 w-3.5" />
                      L10 Meeting Room
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            <div id="workspace-scorecard" className="scroll-mt-20">
              <ScorecardSection
                teamId={teamId}
                scorecard={overview.scorecard}
                canWrite={overview.team.can_write}
                mode="team"
                onIssueFocused={focusIssue}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div id="workspace-issues" className="scroll-mt-20">
                <IssuesSection
                  teamId={teamId}
                  unsolvedIssues={overview.unsolved_issues}
                  eligibleOwners={overview.team.eligible_owners}
                  canWrite={overview.team.can_write}
                  mode="team"
                  highlightedIssueId={highlightedIssueId}
                />
              </div>

              <div id="workspace-todos" className="scroll-mt-20">
                <TodosSection
                  teamId={teamId}
                  initialTodos={overview.todos}
                  eligibleOwners={overview.team.eligible_owners}
                  canWrite={overview.team.can_write}
                  onIssueFocused={focusIssue}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div id="workspace-rocks" className="scroll-mt-20 xl:col-span-2">
                <RocksSection
                  teamId={teamId}
                  rocks={overview.rocks}
                  canWrite={overview.team.can_write}
                  onIssueFocused={focusIssue}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Ended Meetings</CardTitle>
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
                            {mt.facilitator_name} · Rating{" "}
                            <strong className="font-semibold text-[var(--text-primary)]">
                              {mt.rating !== null ? mt.rating.toFixed(1) : "—"}
                            </strong>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openMeetingSummary(mt.id)}
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
          </>
        )}
      </div>

      {/* Historical Meeting Summary Modal (Desktop) / Bottom Sheet (Mobile) */}
      <ResponsiveSheet
        open={Boolean(selectedSummary)}
        onOpenChange={(open) => {
          if (!open) setSelectedSummary(null);
        }}
        title="Ended Meeting Summary"
        description={
          selectedSummary
            ? `Facilitated by ${selectedSummary.facilitator_name}`
            : undefined
        }
        desktopVariant="modal"
        headerIcon={
          <Link href="/" aria-label="TracTiq Home" className="inline-flex rounded-[8px]">
            <TracTiqLogo variant="mark" size="sm" />
          </Link>
        }
        contentClassName="sm:max-w-[780px]"
      >
        {selectedSummary && (
          <div className="p-4 sm:p-5">
            <MeetingSummaryView
              summary={selectedSummary}
              onBackToTeam={() => setSelectedSummary(null)}
            />
          </div>
        )}
      </ResponsiveSheet>

      <AuditLogDrawer
        teamId={teamId}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
      />
    </AppShell>
  );
}
