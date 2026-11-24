"use client";

import React from "react";
import { Award, CheckCircle2, ListTodo, Target, Users } from "lucide-react";
import type { MeetingSummaryRead } from "@/lib/types";
import { formatChicagoTimestamp, formatShortWeek } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MeetingSummaryViewProps {
  summary: MeetingSummaryRead;
  onBackToTeam?: () => void;
}

export function MeetingSummaryView({ summary, onBackToTeam }: MeetingSummaryViewProps) {
  return (
    <div className="space-y-5" data-testid="meeting-summary">
      <Card className="border-teal-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="accent" className="mb-2">
              Level 10 Meeting Summary
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight">
              Scorecard Week of {formatShortWeek(summary.scorecard_week)}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Facilitated by <strong className="text-white">{summary.facilitator_name}</strong> ·{" "}
              {formatChicagoTimestamp(summary.started_at)} →{" "}
              {formatChicagoTimestamp(summary.ended_at)}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-300">
                <Award className="h-3.5 w-3.5 text-teal-400" />
                Avg Rating
              </div>
              <div className="mt-0.5 text-3xl font-bold text-white tabular-nums">
                {summary.rating !== null ? summary.rating.toFixed(1) : "—"}
              </div>
            </div>
            {onBackToTeam && (
              <button
                type="button"
                onClick={onBackToTeam}
                className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                Close Summary
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-teal-600" />
              <CardTitle>Measurables ({formatShortWeek(summary.scorecard_week)})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.measurables_detail.map((m) => (
              <div
                key={m.measurable_id}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.owner_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {m.score_value !== null ? `${m.score_value} ${m.unit}` : "Missing"}
                  </span>
                  <Badge
                    variant={
                      m.status === "on_track"
                        ? "success"
                        : m.status === "off_track"
                          ? "danger"
                          : "secondary"
                    }
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
              <Users className="h-4 w-4 text-teal-600" />
              <CardTitle>Attendees ({summary.attendees_detail.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {summary.attendees_detail.map((att) => (
              <div
                key={att.user_id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <span className="font-semibold text-slate-900">{att.name}</span>
                <Badge variant={att.role === "observer" ? "warning" : "secondary"}>
                  {att.role.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <CardTitle>Issues Solved ({summary.issues_solved_detail.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.issues_solved_detail.length === 0 ? (
              <p className="text-sm text-slate-500">No Issues solved during this meeting.</p>
            ) : (
              summary.issues_solved_detail.map((iss) => (
                <div
                  key={iss.id}
                  className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm"
                >
                  <p className="font-semibold text-slate-900">{iss.title}</p>
                  <p className="mt-1 text-xs text-slate-700">{iss.resolution_note}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-teal-600" />
              <CardTitle>To-Dos Created ({summary.todos_created_detail.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.todos_created_detail.length === 0 ? (
              <p className="text-sm text-slate-500">No To-Dos created during this meeting.</p>
            ) : (
              summary.todos_created_detail.map((td) => (
                <div
                  key={td.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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
      </div>
    </div>
  );
}
