"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error" | "warning";
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 left-4 z-50 flex flex-col gap-2 sm:top-4 sm:right-4 sm:left-auto sm:w-full sm:max-w-sm"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-[12px] border bg-[var(--bg-elevated)] p-3 text-[var(--text-primary)]",
              t.variant === "error" &&
                "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]",
              t.variant === "warning" &&
                "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]",
              t.variant === "success" &&
                "border-[var(--status-on-track-border)] bg-[var(--status-on-track-bg)] text-[var(--status-on-track-text)]",
              (!t.variant || t.variant === "default") &&
                "border-[var(--border-default)]"
            )}
          >
            {t.variant === "error" && (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {t.variant === "warning" && (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {t.variant === "success" && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {(!t.variant || t.variant === "default") && (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-text)]" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold leading-snug">{t.title}</p>
              {t.description && (
                <p className="mt-1 text-xs opacity-90">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] opacity-70 transition-colors hover:bg-[var(--bg-hover)] hover:opacity-100 sm:m-0 sm:h-7 sm:w-7 cursor-pointer"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
