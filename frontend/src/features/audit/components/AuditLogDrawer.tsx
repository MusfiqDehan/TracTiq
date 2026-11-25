"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckSquare,
  History,
  Users,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { AuditLogDetailRead, AuditLogRead } from "@/lib/types";
import { formatChicagoTimestamp } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { ResponsiveSheet } from "@/components/ui/sheet";
import { formatAuditEntry, type AuditBadgeVariant } from "../format-audit";

interface AuditLogDrawerProps {
  teamId: string;
  open: boolean;
  onClose: () => void;
}

function mapAuditBadgeVariant(
  variant: AuditBadgeVariant
): "neutral" | "brand" | "on-track" | "off-track" | "warning" {
  if (variant === "success") return "on-track";
  if (variant === "danger") return "off-track";
  if (variant === "warning") return "warning";
  if (variant === "secondary") return "neutral";
  return "brand";
}

function EntityIcon({
  entityType,
  variant,
}: {
  entityType: string;
  variant: AuditBadgeVariant;
}) {
  const toneClass =
    variant === "success"
      ? "border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] text-[var(--status-on-track-text)]"
      : variant === "danger"
        ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
        : variant === "warning"
          ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
          : variant === "secondary"
            ? "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            : "border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]";

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
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border ${toneClass}`}
      aria-hidden="true"
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function renderStatusValue(label: string, value: string) {
  if (label !== "Status") {
    return (
      <span className="font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </span>
    );
  }
  const lower = value.toLowerCase();
  if (lower === "on track" || lower === "solved" || lower === "completed") {
    return (
      <Badge variant="on-track" dot>
        {value}
      </Badge>
    );
  }
  if (lower === "off track") {
    return (
      <Badge variant="off-track" dot>
        {value}
      </Badge>
    );
  }
  return <Badge variant="neutral">{value}</Badge>;
}

function DetailRow({ detail }: { detail: AuditLogDetailRead }) {
  const isDiff =
    detail.before !== undefined &&
    detail.before !== null &&
    detail.after !== undefined &&
    detail.after !== null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <span className="text-[var(--text-muted)]">{detail.label}</span>
      {isDiff ? (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-right tabular-nums">
          <span className="rounded-[4px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] line-through">
            {detail.before}
          </span>
          <ArrowRight
            className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <span className="rounded-[4px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-text)]">
            {detail.after}
          </span>
        </span>
      ) : (
        <span className="max-w-[72%] break-words text-right">
          {renderStatusValue(detail.label, detail.value ?? "—")}
        </span>
      )}
    </div>
  );
}

const ENTITY_OPTIONS = [
  { value: "", label: "All Activity" },
  { value: "score", label: "Scorecard Updates" },
  { value: "issue", label: "Issues" },
  { value: "todo", label: "To-Dos" },
  { value: "meeting", label: "Level 10 Meetings" },
];

export function AuditLogDrawer({ teamId, open, onClose }: AuditLogDrawerProps) {
  const [entityType, setEntityType] = useState("");
  const [extraRows, setExtraRows] = useState<AuditLogRead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey: ["team-audit", teamId, entityType],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: "25" });
      if (entityType) qs.set("entity_type", entityType);
      const res = await apiRequest<AuditLogRead[]>(
        `/api/teams/${teamId}/audit-logs?${qs.toString()}`
      );
      setExtraRows([]);
      setNextCursor(res.meta.next_cursor);
      return res.data;
    },
    enabled: open,
  });

  const rows = [...(query.data || []), ...extraRows];

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ limit: "25", cursor: nextCursor });
      if (entityType) qs.set("entity_type", entityType);
      const res = await apiRequest<AuditLogRead[]>(
        `/api/teams/${teamId}/audit-logs?${qs.toString()}`
      );
      setExtraRows((prev) => [...prev, ...res.data]);
      setNextCursor(res.meta.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Team Audit Trail"
      description="Plain-language history of team updates and meetings"
      desktopVariant="drawer"
      headerIcon={
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
          <History className="h-4 w-4" />
        </div>
      }
    >
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 sm:px-5">
        <SelectField
          ariaLabel="Filter audit logs by entity type"
          value={entityType}
          onValueChange={setEntityType}
          options={ENTITY_OPTIONS}
          size="sm"
          triggerClassName="w-full"
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Loading activity history...
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-[var(--border-default)] bg-[var(--bg-subtle)] p-6 text-center text-sm text-[var(--text-muted)]">
            No audit events recorded yet. Perform edits or start a meeting to
            see entries here.
          </p>
        ) : (
          rows.map((entry) => {
            const formatted = formatAuditEntry(entry);
            return (
              <article
                key={entry.id}
                className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--border-strong)]"
              >
                <div className="flex items-start gap-3">
                  <EntityIcon
                    entityType={entry.entity_type}
                    variant={formatted.badgeVariant}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={mapAuditBadgeVariant(formatted.badgeVariant)}
                        >
                          {formatted.actionLabel}
                        </Badge>
                        <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                          {formatted.categoryLabel}
                        </span>
                      </div>
                      <time
                        dateTime={entry.created_at}
                        className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums"
                      >
                        {formatChicagoTimestamp(entry.created_at)}
                      </time>
                    </div>

                    <p className="mt-2 text-sm font-medium leading-snug text-[var(--text-primary)]">
                      {formatted.summary}
                    </p>

                    {formatted.details.length > 0 && (
                      <div className="mt-3 space-y-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2">
                        {formatted.details.map((detail, idx) => (
                          <DetailRow
                            key={`${entry.id}-detail-${idx}`}
                            detail={detail}
                          />
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
            <Button
              size="sm"
              variant="secondary"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load More Activity"}
            </Button>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  );
}
