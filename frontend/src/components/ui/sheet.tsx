"use client";

import React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  desktopVariant?: "drawer" | "left-drawer" | "modal";
  headerIcon?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  desktopVariant = "drawer",
  headerIcon,
  children,
  contentClassName,
}: ResponsiveSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay-scrim)]" />
        <Dialog.Content
          aria-label={title}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[16px] border-t border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-sans focus:outline-none pb-safe",
            desktopVariant === "drawer" &&
              "sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:max-h-dvh sm:w-full sm:max-w-[480px] sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0",
            desktopVariant === "left-drawer" &&
              "sm:inset-y-0 sm:left-0 sm:right-auto sm:h-dvh sm:max-h-dvh sm:w-full sm:max-w-[280px] sm:rounded-none sm:border-t-0 sm:border-r sm:pb-0",
            desktopVariant === "modal" &&
              "sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:right-auto sm:w-[calc(100%-32px)] sm:max-w-[720px] sm:max-h-[88dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[12px] sm:border sm:pb-0",
            contentClassName
          )}
        >
          {/* Mobile bottom-sheet grab indicator */}
          <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
          </div>

          <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-3">
              {headerIcon && <div className="shrink-0">{headerIcon}</div>}
              <div className="min-w-0">
                <Dialog.Title className="truncate text-base font-bold tracking-[-0.015em] text-[var(--text-primary)]">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {description}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">
                    {title}
                  </Dialog.Description>
                )}
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={`Close ${title}`}
                className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] sm:h-8 sm:w-8 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
