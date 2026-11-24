import type { AuditLogDetailRead, AuditLogRead } from "@/lib/types";
import { formatShortWeek } from "@/lib/utils";

export type AuditBadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "danger"
  | "warning"
  | "accent"
  | "outline";

export interface FormattedAuditEntry {
  actionLabel: string;
  categoryLabel: string;
  entityLabel: string;
  summary: string;
  details: AuditLogDetailRead[];
  badgeVariant: AuditBadgeVariant;
}

const ENTITY_CATEGORY_LABELS: Record<string, string> = {
  score: "Scorecard",
  issue: "Issue",
  todo: "To-Do",
  meeting: "Meeting",
  rock: "Rock",
};

const SECTION_LABELS: Record<string, string> = {
  scorecard: "Scorecard",
  ids: "IDS",
  conclude: "Conclude",
  ended: "Ended",
};

const STATUS_LABELS: Record<string, string> = {
  on_track: "On Track",
  off_track: "Off Track",
  pending: "Pending",
  active: "Active",
  ended: "Ended",
  complete: "Complete",
};

const IGNORED_FALLBACK_KEYS = new Set([
  "id",
  "company_id",
  "team_id",
  "owner_id",
  "actor_id",
  "measurable_id",
  "source_issue_id",
  "solved_in_meeting_id",
  "created_in_meeting_id",
  "unsolved_issue_id",
  "version",
  "created_at",
  "updated_at",
]);

function humanizeIdentifier(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatPriority(val: unknown): string {
  if (val === null || val === undefined || val === "") return "Unranked";
  return `#${val}`;
}

function formatIsoDate(val: unknown): string | null {
  if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(val)) return null;
  const [y, m, d] = val.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatFallbackValue(val: unknown): string {
  if (val === null || val === undefined) return "None";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return val.toLocaleString("en-US");
  if (typeof val === "string") {
    if (val in STATUS_LABELS) return STATUS_LABELS[val];
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return formatIsoDate(val) ?? val;
    return val;
  }
  if (Array.isArray(val)) {
    return val.length > 0 ? val.map(formatFallbackValue).join(", ") : "None";
  }
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>)
      .filter(([k, v]) => v !== null && v !== undefined && !IGNORED_FALLBACK_KEYS.has(k))
      .map(([k, v]) => `${humanizeIdentifier(k)}: ${formatFallbackValue(v)}`);
    return entries.length > 0 ? entries.join("; ") : "—";
  }
  return String(val);
}

function getBadgeVariant(entry: AuditLogRead, actionLabel: string): AuditBadgeVariant {
  const after = entry.after_state ?? {};
  switch (entry.action) {
    case "IssueSolved":
    case "MeetingStarted":
      return "success";
    case "TodoToggled":
      return after.done_at ? "success" : "warning";
    case "IssueCreated":
    case "IssuePriorityUpdated":
      return "warning";
    case "ScoreUpdated": {
      if (after.status === "on_track") return "success";
      if (after.status === "off_track") return "danger";
      return "accent";
    }
    case "TodoCreated":
    case "MeetingSectionAdvanced":
    case "MeetingRated":
      return "accent";
    case "MeetingEnded":
      return "secondary";
    default: {
      const lower = actionLabel.toLowerCase();
      if (lower.includes("solved") || lower.includes("completed")) return "success";
      if (lower.includes("ended") || lower.includes("deleted")) return "secondary";
      return "accent";
    }
  }
}

function buildFallbackFormat(entry: AuditLogRead): Omit<FormattedAuditEntry, "badgeVariant"> {
  const before = entry.before_state ?? {};
  const after = entry.after_state ?? {};
  const categoryLabel =
    ENTITY_CATEGORY_LABELS[entry.entity_type] ?? humanizeIdentifier(entry.entity_type);
  const actor = entry.actor_name;
  const details: AuditLogDetailRead[] = [];

  if (entry.action === "IssueCreated") {
    const title = typeof after.title === "string" && after.title ? after.title : "Untitled issue";
    if (typeof after.owner_name === "string" && after.owner_name) {
      details.push({ label: "Owner", value: after.owner_name });
    }
    details.push({ label: "Priority", value: formatPriority(after.priority) });
    return {
      actionLabel: "Created Issue",
      categoryLabel,
      entityLabel: title,
      summary: `${actor} created issue "${title}".`,
      details,
    };
  }

  if (entry.action === "IssuePriorityUpdated") {
    const beforePrio = formatPriority(before.priority);
    const afterPrio = formatPriority(after.priority);
    details.push({ label: "Priority", before: beforePrio, after: afterPrio });
    return {
      actionLabel: "Updated Priority",
      categoryLabel,
      entityLabel: "Issue",
      summary: `${actor} changed issue priority from ${beforePrio} to ${afterPrio}.`,
      details,
    };
  }

  if (entry.action === "IssueSolved") {
    details.push({ label: "Status", before: "Open", after: "Solved" });
    if (typeof after.resolution_note === "string" && after.resolution_note) {
      details.push({ label: "Resolution", value: after.resolution_note });
    }
    return {
      actionLabel: "Solved Issue",
      categoryLabel,
      entityLabel: "Issue",
      summary: `${actor} solved an issue.`,
      details,
    };
  }

  if (entry.action === "TodoCreated") {
    const title = typeof after.title === "string" && after.title ? after.title : "Untitled To-Do";
    if (typeof after.owner_name === "string" && after.owner_name) {
      details.push({ label: "Owner", value: after.owner_name });
    }
    const due = formatIsoDate(after.due_date);
    if (due) details.push({ label: "Due Date", value: due });
    if (typeof after.source_issue_title === "string" && after.source_issue_title) {
      details.push({ label: "From Issue", value: after.source_issue_title });
    }
    return {
      actionLabel: "Created To-Do",
      categoryLabel,
      entityLabel: title,
      summary: `${actor} created To-Do "${title}".`,
      details,
    };
  }

  if (entry.action === "TodoToggled") {
    const wasDone = Boolean(before.done_at);
    const isDone = Boolean(after.done_at);
    details.push({
      label: "Status",
      before: wasDone ? "Completed" : "Open",
      after: isDone ? "Completed" : "Open",
    });
    return {
      actionLabel: isDone ? "Completed To-Do" : "Reopened To-Do",
      categoryLabel,
      entityLabel: "To-Do",
      summary: isDone
        ? `${actor} marked a To-Do as completed.`
        : `${actor} reopened a To-Do.`,
      details,
    };
  }

  if (entry.action === "ScoreUpdated") {
    const week =
      typeof after.week_start === "string" ? formatShortWeek(after.week_start) : null;
    if (week) details.push({ label: "Week", value: `Week of ${week}` });
    const hasBefore = before.value !== undefined && before.value !== null;
    const afterVal = formatFallbackValue(after.value);
    if (hasBefore) {
      const beforeVal = formatFallbackValue(before.value);
      details.push({ label: "Score", before: beforeVal, after: afterVal });
    } else {
      details.push({ label: "Score", value: afterVal });
    }
    if (typeof after.status === "string" && after.status) {
      details.push({
        label: "Status",
        value: STATUS_LABELS[after.status] ?? humanizeIdentifier(after.status),
      });
    }
    return {
      actionLabel: hasBefore ? "Updated Score" : "Recorded Score",
      categoryLabel,
      entityLabel: "Scorecard Metric",
      summary: hasBefore
        ? `${actor} updated a score${week ? ` for week of ${week}` : ""} to ${afterVal}.`
        : `${actor} recorded a score of ${afterVal}${week ? ` for week of ${week}` : ""}.`,
      details,
    };
  }

  if (entry.action === "MeetingStarted") {
    const section =
      typeof after.current_section === "string"
        ? (SECTION_LABELS[after.current_section] ?? humanizeIdentifier(after.current_section))
        : "Scorecard";
    details.push({ label: "Starting Section", value: section });
    return {
      actionLabel: "Started Meeting",
      categoryLabel,
      entityLabel: "Level 10 Meeting",
      summary: `${actor} started a Level 10 Meeting.`,
      details,
    };
  }

  if (entry.action === "MeetingSectionAdvanced") {
    const fromSection =
      typeof before.current_section === "string"
        ? (SECTION_LABELS[before.current_section] ?? humanizeIdentifier(before.current_section))
        : "Previous";
    const toSection =
      typeof after.current_section === "string"
        ? (SECTION_LABELS[after.current_section] ?? humanizeIdentifier(after.current_section))
        : "Next";
    details.push({ label: "Section", before: fromSection, after: toSection });
    return {
      actionLabel: "Advanced Meeting",
      categoryLabel,
      entityLabel: "Level 10 Meeting",
      summary: `${actor} moved the Level 10 Meeting from ${fromSection} to ${toSection}.`,
      details,
    };
  }

  if (entry.action === "MeetingRated") {
    const rating = after.rating !== undefined && after.rating !== null ? `${after.rating} / 10` : "—";
    details.push({ label: "Rating", value: rating });
    return {
      actionLabel: "Rated Meeting",
      categoryLabel,
      entityLabel: "Level 10 Meeting",
      summary: `${actor} rated the Level 10 Meeting ${rating}.`,
      details,
    };
  }

  if (entry.action === "MeetingEnded") {
    details.push({ label: "Status", before: "Active", after: "Ended" });
    if (after.rating !== undefined && after.rating !== null) {
      details.push({ label: "Average Rating", value: `${after.rating} / 10` });
    }
    return {
      actionLabel: "Ended Meeting",
      categoryLabel,
      entityLabel: "Level 10 Meeting",
      summary: `${actor} ended the Level 10 Meeting.`,
      details,
    };
  }

  const actionLabel = humanizeIdentifier(entry.action);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of keys) {
    if (IGNORED_FALLBACK_KEYS.has(key)) continue;
    const bVal = before[key];
    const aVal = after[key];
    if (key in before && key in after && bVal !== aVal) {
      details.push({
        label: humanizeIdentifier(key),
        before: formatFallbackValue(bVal),
        after: formatFallbackValue(aVal),
      });
    } else if (aVal !== undefined && aVal !== null) {
      details.push({
        label: humanizeIdentifier(key),
        value: formatFallbackValue(aVal),
      });
    }
  }
  return {
    actionLabel,
    categoryLabel,
    entityLabel: categoryLabel,
    summary: `${actor} performed ${actionLabel.toLowerCase()} on ${categoryLabel}.`,
    details,
  };
}

export function formatAuditEntry(entry: AuditLogRead): FormattedAuditEntry {
  const categoryLabel =
    ENTITY_CATEGORY_LABELS[entry.entity_type] ?? humanizeIdentifier(entry.entity_type);

  if (entry.summary && entry.action_label) {
    const actionLabel = entry.action_label;
    return {
      actionLabel,
      categoryLabel,
      entityLabel: entry.entity_label || categoryLabel,
      summary: entry.summary,
      details: entry.details ?? [],
      badgeVariant: getBadgeVariant(entry, actionLabel),
    };
  }

  const fallback = buildFallbackFormat(entry);
  return {
    ...fallback,
    badgeVariant: getBadgeVariant(entry, fallback.actionLabel),
  };
}
