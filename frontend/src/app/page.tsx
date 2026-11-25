"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock,
  Eye,
  Moon,
  ShieldCheck,
  Sun,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { useTheme } from "@/components/theme/theme-provider";
import { TracTiqLogo } from "@/components/brand/TracTiqLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SeededUserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const FALLBACK_TEAM_NAMES: Record<string, string> = {
  team_lead: "Leadership",
  team_sales: "Sales",
  team_ops: "Operations",
};

export default function SignInPage() {
  const { user, seededUsers, switchUser } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const [enteringUserId, setEnteringUserId] = useState<string | null>(null);

  const teamNameLookup = useMemo(() => {
    const map: Record<string, string> = { ...FALLBACK_TEAM_NAMES };
    for (const t of user?.teams ?? []) {
      map[t.id] = t.name;
    }
    return map;
  }, [user?.teams]);

  const formatUserTeams = (su: SeededUserSummary) => {
    if (su.role === "admin") {
      return "All teams (Leadership, Sales, Operations)";
    }
    return su.team_ids.map((id) => teamNameLookup[id] ?? id).join(", ");
  };

  const handleEnterAs = async (userId: string) => {
    setEnteringUserId(userId);
    try {
      const profile = await switchUser(userId);
      const targetTeam = profile.teams[0]?.id || "team_lead";
      router.push(`/teams/${targetTeam}`);
    } catch {
      setEnteringUserId(null);
    }
  };

  const writeUsers = seededUsers.filter((su) => su.role !== "observer");
  const observerUsers = seededUsers.filter((su) => su.role === "observer");
  const primaryTeam = user?.teams[0];

  const renderAccountRow = (su: SeededUserSummary) => {
    const isCurrent = user?.id === su.id;
    const isBusy = enteringUserId === su.id;

    return (
      <div
        key={su.id}
        className={cn(
          "flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
          isCurrent
            ? "bg-[var(--accent-subtle)]/45"
            : "bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]/45"
        )}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {su.name}
            </span>
            <Badge
              variant={
                su.role === "admin"
                  ? "neutral"
                  : su.role === "observer"
                    ? "warning"
                    : "brand"
              }
            >
              {su.role.replace("_", " ")}
            </Badge>
            {isCurrent && (
              <span className="text-[11px] font-semibold text-[var(--accent-text)]">
                Current session
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-secondary)]">
            <span>{su.email}</span>
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              ·
            </span>
            <span className="text-[var(--text-muted)]">
              {formatUserTeams(su)}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          variant={isCurrent ? "primary" : "secondary"}
          disabled={enteringUserId !== null}
          onClick={() => handleEnterAs(su.id)}
          data-testid={`enter-as-${su.id}`}
          className="w-full shrink-0 sm:w-auto"
        >
          <span>{isBusy ? "Signing in..." : isCurrent ? "Continue" : "Sign in"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Minimal Top Brand Bar */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="TracTiq Home"
            className="inline-flex items-center rounded-[8px] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
          >
            <TracTiqLogo variant="full" size="md" showTag />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Centered Clean Sign-In Picker */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="space-y-2">
          <h1 className="type-display text-[var(--text-primary)]">
            Sign in to your team
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Choose a seeded account to enter your team&apos;s weekly Scorecard,
            Rocks, To-Dos, Issues, and live Level 10 Meeting room.
          </p>
        </div>

        {/* Quick Resume Bar if Session Already Active */}
        {user && primaryTeam && (
          <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--accent-border)] bg-[var(--accent-subtle)]/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[var(--status-on-track-dot)]"
                aria-hidden="true"
              />
              <span className="truncate">
                Active session:{" "}
                <strong className="font-semibold text-[var(--text-primary)]">
                  {user.name}
                </strong>{" "}
                ({user.role.replace("_", " ")})
              </span>
            </div>
            <Link href={`/teams/${primaryTeam.id}`} className="shrink-0">
              <Button size="sm" variant="primary" className="w-full sm:w-auto">
                <span>Open {primaryTeam.name} Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* Group 1: Admin & Team Members */}
        <section aria-labelledby="members-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[var(--accent-text)]" />
              <h2
                id="members-heading"
                className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--text-secondary)]"
              >
                Admin &amp; Team Members
              </h2>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              Edit scores, manage Issues &amp; facilitate L10
            </span>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="divide-y divide-[var(--border-subtle)] p-0">
              {writeUsers.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                  Loading accounts...
                </p>
              ) : (
                writeUsers.map(renderAccountRow)
              )}
            </CardContent>
          </Card>
        </section>

        {/* Group 2: Read-Only Observers */}
        {observerUsers.length > 0 && (
          <section aria-labelledby="observers-heading" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-[var(--status-warning-text)]" />
                <h2
                  id="observers-heading"
                  className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--text-secondary)]"
                >
                  Observers (Read-Only)
                </h2>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                View team data &amp; attend L10 meetings
              </span>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="divide-y divide-[var(--border-subtle)] p-0">
                {observerUsers.map(renderAccountRow)}
              </CardContent>
            </Card>
          </section>
        )}
      </main>

      {/* Quiet Operational Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] pb-safe">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-[var(--text-muted)] sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-text)]" />
            Server-enforced JWT auth &amp; team boundaries
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Clock className="h-3.5 w-3.5" />
            America/Chicago
          </span>
        </div>
      </footer>
    </div>
  );
}
