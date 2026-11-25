import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-base text-[var(--text-primary)] transition-colors placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus-visible:border-[var(--border-focus)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--border-focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
