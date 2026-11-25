import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-2 text-xs font-semibold leading-none tracking-[0.01em] tabular-nums transition-colors",
  {
    variants: {
      variant: {
        neutral:
          "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
        brand:
          "border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]",
        "on-track":
          "border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] text-[var(--status-on-track-text)]",
        "off-track":
          "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]",
        warning:
          "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

const DOT_COLORS = {
  neutral: "bg-[var(--text-muted)]",
  brand: "bg-[var(--accent-text)]",
  "on-track": "bg-[var(--status-on-track-dot)]",
  "off-track": "bg-[var(--status-danger-text)]",
  warning: "bg-[var(--status-warning-dot)]",
} as const;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({
  className,
  variant = "neutral",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const key = variant ?? "neutral";
  return (
    <span className={cn(badgeVariants({ variant: key, className }))} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_COLORS[key])}
        />
      )}
      {children}
    </span>
  );
}
