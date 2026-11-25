import React from "react";
import { cn } from "@/lib/utils";

export interface TracTiqLogoProps {
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  showTag?: boolean;
  className?: string;
}

const MARK_SIZES = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
} as const;

const TEXT_SIZES = {
  sm: "text-base",
  md: "text-[18px]",
  lg: "text-2xl",
} as const;

export function TracTiqLogo({
  variant = "full",
  size = "md",
  showTag = false,
  className,
}: TracTiqLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={cn("shrink-0", MARK_SIZES[size])}
      >
        <rect x="0" y="0" width="32" height="32" rx="8" fill="var(--logo-bg)" />
        <rect
          x="0.5"
          y="0.5"
          width="31"
          height="31"
          rx="7.5"
          stroke="var(--logo-border)"
          strokeWidth="1"
        />
        <path
          d="M7 9.5H18"
          stroke="var(--logo-stem)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M12.5 9.5V22.5"
          stroke="var(--logo-stem)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="23.75" cy="9.5" r="2" fill="var(--logo-tick)" />
        <path
          d="M17.25 18.5L20 21.25L25.25 15.25"
          stroke="var(--logo-tick)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {variant === "full" && (
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "font-bold leading-none tracking-[-0.03em]",
              TEXT_SIZES[size]
            )}
          >
            <span className="text-[var(--text-primary)]">Trac</span>
            <span className="text-[var(--accent-text)]">Tiq</span>
          </span>
          {showTag && (
            <span className="inline-flex h-5 items-center rounded-[4px] border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-1.5 text-[11px] font-semibold tracking-[0.04em] text-[var(--accent-text)] uppercase">
              EOS L10
            </span>
          )}
        </span>
      )}
    </span>
  );
}
