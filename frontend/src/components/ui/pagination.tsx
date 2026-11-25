"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  hasMoreRemote?: boolean;
  loadingMoreRemote?: boolean;
  onLoadMoreRemote?: () => Promise<void> | void;
  className?: string;
}

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  hasMoreRemote = false,
  loadingMoreRemote = false,
  onLoadMoreRemote,
  className,
}: PaginationBarProps) {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, safePage * pageSize);

  const canGoPrev = safePage > 1;
  const canGoNext = safePage < totalPages || hasMoreRemote;

  const handleNext = async () => {
    if (safePage < totalPages) {
      onPageChange(safePage + 1);
      return;
    }
    if (hasMoreRemote && onLoadMoreRemote) {
      await onLoadMoreRemote();
      onPageChange(safePage + 1);
    }
  };

  return (
    <div
      className={cn(
        "mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]",
        className
      )}
    >
      <span className="font-medium tabular-nums">
        Showing{" "}
        <strong className="font-semibold text-[var(--text-primary)]">
          {startIndex}–{endIndex}
        </strong>{" "}
        of{" "}
        <strong className="font-semibold text-[var(--text-primary)]">
          {totalItems}
          {hasMoreRemote ? "+" : ""}
        </strong>
      </span>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canGoPrev || loadingMoreRemote}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Prev</span>
        </Button>

        <span className="min-w-[72px] text-center font-semibold text-[var(--text-secondary)] tabular-nums">
          Page {safePage} / {totalPages}
          {hasMoreRemote ? "+" : ""}
        </span>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canGoNext || loadingMoreRemote}
          onClick={handleNext}
          aria-label="Next page"
        >
          <span>{loadingMoreRemote ? "Loading..." : "Next"}</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
