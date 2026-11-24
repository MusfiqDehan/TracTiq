import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatShortWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatChicagoTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export function formatGoalText(goal: {
  type: string;
  value?: number | null;
  min?: number | null;
  max?: number | null;
}, unit: string): string {
  const u = unit === "$" || unit === "$k" || unit === "%" ? unit : ` ${unit}`;
  const fmt = (n: number | null | undefined) => {
    if (n === null || n === undefined) return "";
    if (unit === "$k") return `$${n}k`;
    if (unit === "%") return `${n}%`;
    return `${n}${u === " count" ? "" : u}`;
  };
  switch (goal.type) {
    case "at_least":
      return `≥ ${fmt(goal.value)}`;
    case "at_most":
      return `≤ ${fmt(goal.value)}`;
    case "between":
      return `${fmt(goal.min)}–${fmt(goal.max)}`;
    case "exactly":
      return `= ${fmt(goal.value)}`;
    default:
      return String(goal.value ?? "");
  }
}

export function formatTimerClock(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
