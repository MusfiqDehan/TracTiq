"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  History,
  Layers,
  Play,
  Radio,
  Shield,
  Users,
} from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MeetingActiveRead } from "@/lib/types";

interface AppHeaderProps {
  currentTeamId?: string;
  activeMeeting?: MeetingActiveRead | null;
  wsConnected?: boolean;
  onStartMeeting?: () => void;
  startingMeeting?: boolean;
  onOpenAuditLog?: () => void;
}

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "accent" | "warning" }> = {
  admin: { label: "Admin", variant: "default" },
  team_member: { label: "Member", variant: "accent" },
  observer: { label: "Observer", variant: "warning" },
};

export function AppHeader({
  currentTeamId,
  activeMeeting,
  wsConnected,
  onStartMeeting,
  startingMeeting,
  onOpenAuditLog,
}: AppHeaderProps) {
  const { user, seededUsers, switchUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isMeetingPage = pathname?.endsWith("/meeting");

  const handleUserChange = async (nextUserId: string) => {
    const nextProfile = await switchUser(nextUserId);
    if (currentTeamId) {
      const canAccessCurrent = nextProfile.teams.some((t) => t.id === currentTeamId);
      if (!canAccessCurrent && nextProfile.teams.length > 0) {
        router.push(`/teams/${nextProfile.teams[0].id}`);
      }
    }
  };

  const handleTeamChange = (nextTeamId: string) => {
    if (!nextTeamId) return;
    if (isMeetingPage) {
      router.push(`/teams/${nextTeamId}/meeting`);
    } else {
      router.push(`/teams/${nextTeamId}`);
    }
  };

  const roleMeta = user ? ROLE_LABELS[user.role] : null;
  const canWrite = user?.role !== "observer";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg pr-2 text-slate-950 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-teal-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight">TracTiq</span>
              <span className="ml-1.5 hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 sm:inline">
                EOS L10
              </span>
            </div>
          </Link>

          {user && user.teams.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <label htmlFor="team-switcher" className="sr-only">
                Active Team
              </label>
              <select
                id="team-switcher"
                aria-label="Team Switcher"
                value={currentTeamId && user.teams.some((t) => t.id === currentTeamId) ? currentTeamId : ""}
                onChange={(e) => handleTeamChange(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-900 focus:outline-none"
              >
                {!currentTeamId || !user.teams.some((t) => t.id === currentTeamId) ? (
                  <option value="" disabled>
                    Select team...
                  </option>
                ) : null}
                {user.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentTeamId && (
            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href={`/teams/${currentTeamId}`}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  !isMeetingPage
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Team Workspace
              </Link>
              <Link
                href={`/teams/${currentTeamId}/meeting`}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isMeetingPage
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Level 10 Meeting
              </Link>
            </nav>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {typeof wsConnected === "boolean" && (
            <Badge variant={wsConnected ? "success" : "secondary"} className="hidden sm:inline-flex">
              <Radio className={`h-3 w-3 ${wsConnected ? "animate-pulse" : ""}`} />
              {wsConnected ? "Live Sync" : "Connecting"}
            </Badge>
          )}

          {currentTeamId && activeMeeting && !isMeetingPage && (
            <Link href={`/teams/${currentTeamId}/meeting`}>
              <Button size="sm" variant="accent" className="gap-1.5">
                <Activity className="h-3.5 w-3.5 animate-pulse" />
                Join Live L10
              </Button>
            </Link>
          )}

          {currentTeamId && !activeMeeting && !isMeetingPage && canWrite && onStartMeeting && (
            <Button
              size="sm"
              variant="accent"
              onClick={onStartMeeting}
              disabled={startingMeeting}
            >
              <Play className="h-3.5 w-3.5" />
              {startingMeeting ? "Starting..." : "Start L10 Meeting"}
            </Button>
          )}

          {currentTeamId && onOpenAuditLog && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenAuditLog}
              title="View team audit trail"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Audit Trail</span>
            </Button>
          )}

          {seededUsers.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-2xs">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              <label htmlFor="seeded-user-switcher" className="sr-only">
                Seeded User Switcher
              </label>
              <select
                id="seeded-user-switcher"
                aria-label="Seeded User Switcher"
                value={user?.id || "u1"}
                onChange={(e) => handleUserChange(e.target.value)}
                className="max-w-[165px] bg-transparent text-xs font-semibold text-slate-900 focus:outline-none sm:text-sm"
              >
                {seededUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.replace("_", " ")})
                  </option>
                ))}
              </select>
              {roleMeta && <Badge variant={roleMeta.variant}>{roleMeta.label}</Badge>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
