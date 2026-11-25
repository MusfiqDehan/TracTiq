"use client";

import React from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPTY_SENTINEL = "__tractiq_empty__";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  value: string;
  onValueChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "md";
  triggerClassName?: string;
  leadingIcon?: React.ReactNode;
}

export function SelectField({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  ariaLabel,
  disabled = false,
  id,
  size = "md",
  triggerClassName,
  leadingIcon,
}: SelectFieldProps) {
  const encodedValue = value === "" ? EMPTY_SENTINEL : value;
  const hasMatchingOption = options.some(
    (opt) => (opt.value === "" ? EMPTY_SENTINEL : opt.value) === encodedValue
  );

  return (
    <Select.Root
      value={hasMatchingOption ? encodedValue : undefined}
      onValueChange={(next) =>
        onValueChange(next === EMPTY_SENTINEL ? "" : next)
      }
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 text-left font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]/40 focus-visible:border-[var(--border-focus)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--border-focus)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
          size === "sm"
            ? "h-11 text-sm sm:h-8 sm:text-xs"
            : "h-11 text-sm sm:h-9 sm:text-sm",
          triggerClassName
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {leadingIcon && (
            <span className="shrink-0 text-[var(--text-muted)]" aria-hidden="true">
              {leadingIcon}
            </span>
          )}
          <span className="truncate">
            <Select.Value placeholder={placeholder} />
          </span>
        </span>
        <Select.Icon asChild>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 text-[var(--text-primary)] font-sans"
        >
          <Select.Viewport className="space-y-0.5">
            {options.map((opt) => {
              const encoded = opt.value === "" ? EMPTY_SENTINEL : opt.value;
              return (
                <Select.Item
                  key={encoded}
                  value={encoded}
                  disabled={opt.disabled}
                  className="relative flex min-h-11 sm:min-h-8 w-full select-none items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-sm sm:text-xs font-medium text-[var(--text-primary)] outline-none transition-colors data-[highlighted]:bg-[var(--bg-hover)] data-[state=checked]:bg-[var(--accent-subtle)] data-[state=checked]:text-[var(--accent-text)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40 cursor-pointer"
                >
                  <Select.ItemText>{opt.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-text)]" />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
