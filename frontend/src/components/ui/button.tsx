"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "border border-transparent bg-[var(--accent-primary)] text-[#f7f7f5] hover:bg-[var(--accent-primary-hover)]",
        secondary:
          "border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]",
        ghost:
          "border border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        destructive:
          "border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] hover:border-transparent hover:bg-[var(--status-danger-solid)] hover:text-[#f7f7f5]",
        "destructive-solid":
          "border border-transparent bg-[var(--status-danger-solid)] text-[#f7f7f5] hover:bg-[var(--status-danger-solid-hover)]",
      },
      size: {
        md: "h-11 px-4 text-sm sm:h-9",
        sm: "h-11 px-3 text-xs sm:h-8",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-11 w-11 p-0 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";
