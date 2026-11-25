"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: Array<SegmentedOption<T>>;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--border-focus)]",
              size === "sm"
                ? "min-h-9 px-2.5 text-xs sm:min-h-7"
                : "min-h-10 px-3 text-xs sm:min-h-7",
              active
                ? "border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
