"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  MeetingActiveRead,
  MeetingSummaryRead,
  TeamOverviewRead,
} from "@/lib/types";
import { formatChicagoTimestamp } from "@/lib/utils";
import { useTeamRealtime } from "@/lib/ws-client";
import { useAuth } from "@/features/auth/auth-context";
import { AppHeader } from "@/components/layout/AppHeader";
import { AuditLogDrawer } from "@/features/audit/components/AuditLogDrawer";
import { ScorecardSection } from "@/features/scorecard/components/ScorecardSection";
import { IssuesSection } from "@/features/issues/components/IssuesSection";
import { TodosSection } from "@/features/todos/components/TodosSection";
import { RocksSection } from "@/features/rocks/components/RocksSection";
import { MeetingSummaryView } from "@/features/meetings/components/MeetingSummaryView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<MeetingSummaryRead | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["team-overview", teamId, user?.id],
    queryFn: async () => {
      const res = await apiRequest<TeamOverviewRead>(`/api/teams/${teamId}/overview`);
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
    const el = document.querySelector(`[data-testid="issue-card-${issueId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightedIssueId(null), 4000);
  };

  const openMeetingSummary = async (meetingId: string) => {
    try {
      const res = await apiRequest<MeetingSummaryRead>(`/api/meetings/${meetingId}/summary`);
      setSelectedSummary(res.data);
    } catch (err) {
      pushToast({
        title: "Failed to load summary",
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
          <Card data-testid="team-access-denied">
            <CardContent className="space-y-4 p-8">
              <Badge variant="danger">404 · Access Restricted</Badge>
              <h1 className="text-2xl font-bold text-slate-900">Team Not Found or Restricted</h1>
              <p className="text-sm text-slate-600">
                Server authorization confirmed your current account ({user?.name}) does not
                have access to team <code className="font-mono font-semibold">{teamId}</code>.
              </p>
              {user && user.teams.length > 0 && (
                <Link href={`/teams/${user.teams[0].id}`}>
                  <Button>Go to {user.teams[0].name}</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const activeMeeting =
    liveMeeting !== undefined ? liveMeeting : overview?.team.active_meeting ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        currentTeamId={teamId}
        activeMeeting={activeMeeting}
        wsConnected={connected}
        onStartMeeting={() => startMeetingMutation.mutate()}
        startingMeeting={startMeetingMutation.isPending}
        onOpenAuditLog={() => setAuditOpen(true)}
      />

      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
        {!overview ? (
          <Card>
            <CardContent className="p-12 text-center text-sm text-slate-500">
              Loading team workspace...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    {overview.team.name} Team
                  </h1>
                  <Badge variant="secondary">{overview.team.company_name}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Company timezone: {overview.team.company_timezone} · Today:{" "}
                  {overview.team.today}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/teams/${teamId}/meeting`}>
                  <Button variant={activeMeeting ? "accent" : "outline"} size="sm">
                    {activeMeeting ? "Join Active L10 Meeting" : "Go to L10 Meeting Room"}
                  </Button>
                </Link>
              </div>
            </div>

            {selectedSummary && (
              <MeetingSummaryView
                summary={selectedSummary}
                onBackToTeam={() => setSelectedSummary(null)}
              />
            )}

            <ScorecardSection
              teamId={teamId}
              scorecard={overview.scorecard}
              canWrite={overview.team.can_write}
              mode="team"
              onIssueFocused={focusIssue}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <IssuesSection
                teamId={teamId}
                unsolvedIssues={overview.unsolved_issues}
                eligibleOwners={overview.team.eligible_owners}
                canWrite={overview.team.can_write}
                mode="team"
                highlightedIssueId={highlightedIssueId}
              />

              <TodosSection
                teamId={teamId}
                initialTodos={overview.todos}
                eligibleOwners={overview.team.eligible_owners}
                canWrite={overview.team.can_write}
                onIssueFocused={focusIssue}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
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
                            {mt.facilitator_name} · Rating{" "}
                            <strong>{mt.rating !== null ? mt.rating.toFixed(1) : "—"}</strong>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openMeetingSummary(mt.id)}
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
      </main>

      <AuditLogDrawer
        teamId={teamId}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
      />
    </div>
  );
}
