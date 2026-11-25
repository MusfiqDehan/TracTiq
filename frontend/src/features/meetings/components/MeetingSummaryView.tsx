"use client";

import React from "react";
import Link from "next/link";
import { Award, CheckCircle2, ListTodo, Target, Users } from "lucide-react";
import type { MeetingSummaryRead } from "@/lib/types";
import { formatChicagoTimestamp, formatShortWeek } from "@/lib/utils";
import { TracTiqLogo } from "@/components/brand/TracTiqLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MeetingSummaryViewProps {
  summary: MeetingSummaryRead;
  onBackToTeam?: () => void;
}

export function MeetingSummaryView({
  summary,
  onBackToTeam,
}: MeetingSummaryViewProps) {
  return (
    <div className="space-y-5" data-testid="meeting-summary">
      <Card className="border-[var(--accent-border)] bg-[var(--bg-elevated)]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                aria-label="TracTiq Home"
                className="inline-flex items-center rounded-[8px]"
              >
                <TracTiqLogo variant="mark" size="sm" />
              </Link>
              <Badge variant="brand">Level 10 Meeting Summary</Badge>
            </div>
            <h2 className="type-h1 text-[var(--text-primary)] tabular-nums">
              Scorecard Week of {formatShortWeek(summary.scorecard_week)}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] tabular-nums">
              Facilitated by{" "}
              <strong className="font-semibold text-[var(--text-primary)]">
                {summary.facilitator_name}
              </strong>{" "}
              · {formatChicagoTimestamp(summary.started_at)} →{" "}
              {formatChicagoTimestamp(summary.ended_at)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                <Award className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                Avg Rating
              </div>
              <div className="type-display mt-0.5 text-[var(--text-primary)] tabular-nums">
                {summary.rating !== null ? summary.rating.toFixed(1) : "—"}
              </div>
            </div>
            {onBackToTeam && (
              <Button type="button" variant="secondary" size="sm" onClick={onBackToTeam}>
                Close Summary
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--accent-text)]" />
              <CardTitle className="tabular-nums">
                Measurables ({formatShortWeek(summary.scorecard_week)})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.measurables_detail.map((m) => (
              <div
                key={m.measurable_id}
                className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-primary)]">
                    {m.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {m.owner_name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">
                    {m.score_value !== null
                      ? `${m.score_value} ${m.unit}`
                      : "Missing"}
                  </span>
                  <Badge
                    variant={
                      m.status === "on_track"
                        ? "on-track"
                        : m.status === "off_track"
                          ? "off-track"
                          : "neutral"
                    }
                    dot
                  >
                    {m.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--accent-text)]" />
              <CardTitle className="tabular-nums">
                Attendees ({summary.attendees_detail.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {summary.attendees_detail.map((att) => (
              <div
                key={att.user_id}
                className="flex items-center gap-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs"
              >
                <span className="font-semibold text-[var(--text-primary)]">
                  {att.name}
                </span>
                <Badge
                  variant={att.role === "observer" ? "warning" : "neutral"}
                >
                  {att.role.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--status-on-track-text)]" />
              <CardTitle className="tabular-nums">
                Issues Solved ({summary.issues_solved_detail.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.issues_solved_detail.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No Issues solved during this meeting.
              </p>
            ) : (
              summary.issues_solved_detail.map((iss) => (
                <div
                  key={iss.id}
                  className="rounded-[8px] border border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] p-3 text-sm"
                >
                  <p className="font-semibold text-[var(--text-primary)]">
                    {iss.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {iss.resolution_note}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-[var(--accent-text)]" />
              <CardTitle className="tabular-nums">
                To-Dos Created ({summary.todos_created_detail.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.todos_created_detail.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No To-Dos created during this meeting.
              </p>
            ) : (
              summary.todos_created_detail.map((td) => (
                <div
                  key={td.id}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-primary)]">
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
      </div>
    </div>
  );
}
