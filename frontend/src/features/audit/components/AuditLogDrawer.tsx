"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckSquare,
  History,
  Users,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { AuditLogDetailRead, AuditLogRead } from "@/lib/types";
import { formatChicagoTimestamp } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAuditEntry, type AuditBadgeVariant } from "../format-audit";

interface AuditLogDrawerProps {
  teamId: string;
  open: boolean;
  onClose: () => void;
}

function EntityIcon({ entityType, variant }: { entityType: string; variant: AuditBadgeVariant }) {
  const toneClass =
    variant === "success"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
      : variant === "danger"
        ? "bg-rose-50 text-rose-700 ring-rose-200/80"
        : variant === "warning"
          ? "bg-amber-50 text-amber-700 ring-amber-200/80"
          : variant === "secondary"
            ? "bg-slate-100 text-slate-600 ring-slate-200"
            : "bg-teal-50 text-teal-700 ring-teal-200/80";

  const Icon =
    entityType === "score"
      ? BarChart3
      : entityType === "issue"
        ? AlertCircle
        : entityType === "todo"
          ? CheckSquare
          : entityType === "meeting"
            ? Users
            : History;

  return (
    <div
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${toneClass}`}
      aria-hidden="true"
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function renderStatusValue(label: string, value: string) {
  if (label !== "Status") {
    return <span className="font-medium text-slate-800">{value}</span>;
  }
  const lower = value.toLowerCase();
  if (lower === "on track" || lower === "solved" || lower === "completed") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
        {value}
      </span>
    );
  }
  if (lower === "off track") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200/70">
        {value}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      {value}
    </span>
  );
}

function DetailRow({ detail }: { detail: AuditLogDetailRead }) {
  const isDiff =
    detail.before !== undefined &&
    detail.before !== null &&
    detail.after !== undefined &&
    detail.after !== null;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
      <span className="text-slate-500">{detail.label}</span>
      {isDiff ? (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-right">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 line-through">
            {detail.before}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-900 ring-1 ring-teal-200/70">
            {detail.after}
          </span>
        </span>
      ) : (
        <span className="max-w-[72%] text-right break-words">
          {renderStatusValue(detail.label, detail.value ?? "—")}
        </span>
      )}
    </div>
  );
}

export function AuditLogDrawer({ teamId, open, onClose }: AuditLogDrawerProps) {
  const [entityType, setEntityType] = useState("");
  const [extraRows, setExtraRows] = useState<AuditLogRead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const query = useQuery({
    queryKey: ["team-audit", teamId, entityType],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: "25" });
      if (entityType) qs.set("entity_type", entityType);
      const res = await apiRequest<AuditLogRead[]>(`/api/teams/${teamId}/audit-logs?${qs.toString()}`);
      setExtraRows([]);
      setNextCursor(res.meta.next_cursor);
      return res.data;
    },
    enabled: open,
  });

  if (!open) return null;

  const rows = [...(query.data || []), ...extraRows];

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ limit: "25", cursor: nextCursor });
      if (entityType) qs.set("entity_type", entityType);
      const res = await apiRequest<AuditLogRead[]>(`/api/teams/${teamId}/audit-logs?${qs.toString()}`);
      setExtraRows((prev) => [...prev, ...res.data]);
      setNextCursor(res.meta.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Team Audit Trail"
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200/70">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Team Audit Trail</h2>
              <p className="text-xs text-slate-500">
                Plain-language history of team updates and meetings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Audit Trail"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <select
            aria-label="Filter audit logs by entity type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">All Activity</option>
            <option value="score">Scorecard Updates</option>
            <option value="issue">Issues</option>
            <option value="todo">To-Dos</option>
            <option value="meeting">Level 10 Meetings</option>
          </select>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading activity history...</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">
              No audit events recorded yet. Perform edits or start a meeting to see entries here.
            </p>
          ) : (
            rows.map((entry) => {
              const formatted = formatAuditEntry(entry);
              return (
                <article
                  key={entry.id}
                  className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-colors hover:border-slate-300"
                >
                  <div className="flex items-start gap-3">
                    <EntityIcon entityType={entry.entity_type} variant={formatted.badgeVariant} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={formatted.badgeVariant}>{formatted.actionLabel}</Badge>
                          <span className="text-[11px] font-medium text-slate-500">
                            {formatted.categoryLabel}
                          </span>
                        </div>
                        <time
                          dateTime={entry.created_at}
                          className="text-[11px] text-slate-400"
                        >
                          {formatChicagoTimestamp(entry.created_at)}
                        </time>
                      </div>

                      <p className="mt-2 text-sm leading-snug font-medium text-slate-800">
                        {formatted.summary}
                      </p>

                      {formatted.details.length > 0 && (
                        <div className="mt-2.5 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                          {formatted.details.map((detail, idx) => (
                            <DetailRow key={`${entry.id}-detail-${idx}`} detail={detail} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load More Activity"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
