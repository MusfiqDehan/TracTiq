"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  History,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Radio,
  Shield,
  Sun,
  UserCircle2,
  Users,
} from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";
import { TracTiqLogo } from "@/components/brand/TracTiqLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "@/components/ui/sheet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select";
import type { MeetingActiveRead } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  children: React.ReactNode;
  currentTeamId?: string;
  activeMeeting?: MeetingActiveRead | null;
  wsConnected?: boolean;
  onStartMeeting?: () => void;
  startingMeeting?: boolean;
  onOpenAuditLog?: () => void;
  forceCollapsedRail?: boolean;
  mobileBottomPaddingExtra?: boolean;
}

const ROLE_META: Record<
  string,
  { label: string; variant: "neutral" | "brand" | "warning" }
> = {
  admin: { label: "Admin", variant: "neutral" },
  team_member: { label: "Member", variant: "brand" },
  observer: { label: "Observer", variant: "warning" },
};

export function AppShell({
  children,
  currentTeamId,
  activeMeeting,
  wsConnected,
  onStartMeeting,
  startingMeeting,
  onOpenAuditLog,
  forceCollapsedRail = false,
  mobileBottomPaddingExtra = false,
}: AppShellProps) {
  const { user, seededUsers, switchUser } = useAuth();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);

  const isHomePage = pathname === "/";
  const isMeetingPage = Boolean(pathname?.endsWith("/meeting"));
  const effectiveTeamId = currentTeamId || user?.teams[0]?.id;
  const isSidebarCollapsed =
    manualCollapsed !== null ? manualCollapsed : forceCollapsedRail;

  const roleMeta = user ? ROLE_META[user.role] : null;
  const canWrite = user?.role !== "observer";

  const handleUserChange = async (nextUserId: string) => {
    const nextProfile = await switchUser(nextUserId);
    if (currentTeamId) {
      const canAccessCurrent = nextProfile.teams.some(
        (t) => t.id === currentTeamId
      );
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

  const teamOptions = (user?.teams ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  const personaOptions = seededUsers.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.role.replace("_", " ")})`,
  }));

  const themeOptions: Array<{
    value: ThemePreference;
    label: React.ReactNode;
    ariaLabel: string;
  }> = [
    {
      value: "light",
      label: (
        <>
          <Sun className="h-3.5 w-3.5" />
          <span>Light</span>
        </>
      ),
      ariaLabel: "Light theme",
    },
    {
      value: "dark",
      label: (
        <>
          <Moon className="h-3.5 w-3.5" />
          <span>Dark</span>
        </>
      ),
      ariaLabel: "Dark theme",
    },
    {
      value: "system",
      label: (
        <>
          <Monitor className="h-3.5 w-3.5" />
          <span>Auto</span>
        </>
      ),
      ariaLabel: "System theme",
    },
  ];

  const renderNavLinks = (collapsed: boolean, onNavigate?: () => void) => (
    <nav aria-label="Workspace navigation" className="space-y-1">
      {effectiveTeamId && (
        <>
          <Link
            href={`/teams/${effectiveTeamId}`}
            onClick={onNavigate}
            title={collapsed ? "Team Workspace" : undefined}
            className={cn(
              "flex h-11 sm:h-9 items-center gap-3 rounded-[8px] px-3 text-sm font-semibold transition-colors",
              collapsed && "justify-center px-0",
              !isHomePage && !isMeetingPage
                ? "border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            )}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Team Workspace</span>}
          </Link>

          <Link
            href={`/teams/${effectiveTeamId}/meeting`}
            onClick={onNavigate}
            title={collapsed ? "Level 10 Meeting" : undefined}
            className={cn(
              "flex h-11 sm:h-9 items-center justify-between gap-2 rounded-[8px] px-3 text-sm font-semibold transition-colors",
              collapsed && "justify-center px-0",
              isMeetingPage
                ? "border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Radio className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">Level 10 Meeting</span>}
            </span>
            {!collapsed && activeMeeting && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[var(--status-on-track-dot)]"
                aria-label="Live meeting active"
              />
            )}
          </Link>
        </>
      )}

      {currentTeamId && onOpenAuditLog && (
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onOpenAuditLog();
          }}
          title={collapsed ? "Audit Trail" : undefined}
          className={cn(
            "flex h-11 sm:h-9 w-full items-center gap-3 rounded-[8px] border border-transparent px-3 text-left text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer",
            collapsed && "justify-center px-0"
          )}
        >
          <History className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Audit Trail</span>}
        </button>
      )}
    </nav>
  );

  const renderAccountAndThemePanel = () => (
    <div className="space-y-4">
      {seededUsers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Active Account
            </span>
            {roleMeta && <Badge variant={roleMeta.variant}>{roleMeta.label}</Badge>}
          </div>
          <SelectField
            ariaLabel="Seeded User Switcher"
            value={user?.id || "u1"}
            onValueChange={handleUserChange}
            options={personaOptions}
            size="sm"
            leadingIcon={<Shield className="h-3.5 w-3.5" />}
            triggerClassName="w-full"
          />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
          >
            <ArrowLeftRight className="h-3 w-3" />
            <span>Sign-in screen</span>
          </Link>
        </div>
      )}

      <div className="space-y-2">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          Appearance
        </span>
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          options={themeOptions}
          ariaLabel="Theme preference"
          size="sm"
          className="w-full"
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop Collapsible Sidebar (1024px+) */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-elevated)] transition-[width] duration-150 lg:flex",
          isSidebarCollapsed ? "w-16" : "w-16 xl:w-[240px]"
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b border-[var(--border-subtle)] px-3",
            isSidebarCollapsed ? "justify-center" : "justify-center xl:justify-between xl:px-4"
          )}
        >
          <Link
            href="/"
            aria-label="TracTiq Home"
            className="inline-flex items-center rounded-[8px] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
          >
            <span className={cn(isSidebarCollapsed ? "inline-flex" : "inline-flex xl:hidden")}>
              <TracTiqLogo variant="mark" size="md" />
            </span>
            {!isSidebarCollapsed && (
              <span className="hidden xl:inline-flex">
                <TracTiqLogo variant="full" size="md" showTag />
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setManualCollapsed(!isSidebarCollapsed)}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer",
              !isSidebarCollapsed && "xl:inline-flex"
            )}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className={cn(isSidebarCollapsed ? "block" : "block xl:hidden")}>
            {renderNavLinks(true)}
          </div>
          {!isSidebarCollapsed && (
            <div className="hidden xl:block">{renderNavLinks(false)}</div>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3">
          {/* Expanded xl sidebar controls */}
          {!isSidebarCollapsed && (
            <div className="hidden xl:block">{renderAccountAndThemePanel()}</div>
          )}

          {/* Compact 64px rail controls */}
          <div
            className={cn(
              "flex flex-col items-center gap-2",
              !isSidebarCollapsed && "xl:hidden"
            )}
          >
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setManualCollapsed(false)}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="hidden h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] xl:inline-flex cursor-pointer"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              aria-label="Switch active persona"
              title={user ? `${user.name} (${user.role.replace("_", " ")})` : "Account"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <UserCircle2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Primary Column: Top Contextual Header + Main Canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-elevated)] pt-safe">
          <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between gap-3 px-4 sm:px-6">
            {/* Left Cluster: Mobile/Tablet Brand + Header Team Switcher (§2.5 requirement) */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {/* Tablet drawer trigger (640px–1023px) */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setTabletDrawerOpen(true)}
                aria-label="Open navigation menu"
                className="hidden sm:inline-flex lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </Button>

              {/* Mobile / Tablet brand mark */}
              <Link
                href="/"
                aria-label="TracTiq Home"
                className="inline-flex shrink-0 items-center lg:hidden"
              >
                <span className="inline-flex sm:hidden">
                  <TracTiqLogo variant="mark" size="sm" />
                </span>
                <span className="hidden sm:inline-flex">
                  <TracTiqLogo variant="full" size="sm" />
                </span>
              </Link>

              {/* Persistent Header Team Switcher across all viewports */}
              {user && teamOptions.length > 0 && (
                <div className="min-w-0">
                  <SelectField
                    id="team-switcher"
                    ariaLabel="Team Switcher"
                    value={
                      currentTeamId &&
                      user.teams.some((t) => t.id === currentTeamId)
                        ? currentTeamId
                        : ""
                    }
                    onValueChange={handleTeamChange}
                    options={teamOptions}
                    placeholder="Select team..."
                    size="sm"
                    leadingIcon={<Users className="h-3.5 w-3.5" />}
                    triggerClassName="max-w-[168px] sm:max-w-[220px]"
                  />
                </div>
              )}
            </div>

            {/* Right Cluster: Live Sync, Start/Join L10 CTA, Tablet Theme/Account */}
            <div className="flex shrink-0 items-center gap-2">
              {typeof wsConnected === "boolean" && (
                <Badge
                  variant={wsConnected ? "on-track" : "neutral"}
                  dot
                  className="hidden sm:inline-flex"
                >
                  {wsConnected ? "Live Sync" : "Connecting"}
                </Badge>
              )}

              {currentTeamId && activeMeeting && !isMeetingPage && (
                <Link href={`/teams/${currentTeamId}/meeting`}>
                  <Button size="sm" variant="primary">
                    <Activity className="h-3.5 w-3.5" />
                    <span>Join L10</span>
                  </Button>
                </Link>
              )}

              {currentTeamId &&
                !activeMeeting &&
                !isMeetingPage &&
                canWrite &&
                onStartMeeting && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onStartMeeting}
                    disabled={startingMeeting}
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {startingMeeting ? "Starting..." : "Start L10 Meeting"}
                    </span>
                    <span className="sm:hidden">
                      {startingMeeting ? "Starting..." : "Start L10"}
                    </span>
                  </Button>
                )}

              {currentTeamId && onOpenAuditLog && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onOpenAuditLog}
                  title="View team audit trail"
                  className="hidden sm:inline-flex"
                >
                  <History className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Audit Trail</span>
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="Toggle color theme"
                title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                className="inline-flex lg:hidden"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "mx-auto w-full max-w-[1680px] flex-1 px-4 py-5 sm:px-6 sm:py-6",
            mobileBottomPaddingExtra ? "pb-36 sm:pb-8" : "pb-24 sm:pb-8"
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile Safe-Area Bottom Navigation Bar (320px–639px) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-default)] bg-[var(--bg-elevated)] pb-safe sm:hidden"
      >
        <div className="grid grid-cols-4">
          <Link
            href={effectiveTeamId ? `/teams/${effectiveTeamId}` : "/"}
            className={cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors",
              !isMeetingPage && !isHomePage
                ? "text-[var(--accent-text)]"
                : "text-[var(--text-muted)]"
            )}
          >
            <LayoutGrid className="h-5 w-5" />
            <span>Workspace</span>
          </Link>

          <Link
            href={effectiveTeamId ? `/teams/${effectiveTeamId}/meeting` : "/"}
            className={cn(
              "relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors",
              isMeetingPage
                ? "text-[var(--accent-text)]"
                : "text-[var(--text-muted)]"
            )}
          >
            <span className="relative">
              <Radio className="h-5 w-5" />
              {activeMeeting && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-[var(--status-on-track-dot)]"
                />
              )}
            </span>
            <span>L10 Room</span>
          </Link>

          {currentTeamId && onOpenAuditLog ? (
            <button
              type="button"
              onClick={onOpenAuditLog}
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] cursor-pointer"
            >
              <History className="h-5 w-5" />
              <span>Audit</span>
            </button>
          ) : (
            <Link
              href="/"
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors",
                isHomePage
                  ? "text-[var(--accent-text)]"
                  : "text-[var(--text-muted)]"
              )}
            >
              <ArrowLeftRight className="h-5 w-5" />
              <span>Switch</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setAccountSheetOpen(true)}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] cursor-pointer"
          >
            <UserCircle2 className="h-5 w-5" />
            <span>Account</span>
          </button>
        </div>
      </nav>

      {/* Tablet Left Slide-Over Navigation Drawer */}
      <ResponsiveSheet
        open={tabletDrawerOpen}
        onOpenChange={setTabletDrawerOpen}
        title="TracTiq Workspace"
        description={user ? `EOS Operating System · ${user.company_timezone}` : "EOS Operating System"}
        desktopVariant="left-drawer"
        headerIcon={
          <Link
            href="/"
            aria-label="TracTiq Home"
            onClick={() => setTabletDrawerOpen(false)}
            className="inline-flex items-center rounded-[8px]"
          >
            <TracTiqLogo variant="mark" size="sm" />
          </Link>
        }
      >
        <div className="flex flex-1 flex-col justify-between gap-6 p-4">
          {renderNavLinks(false, () => setTabletDrawerOpen(false))}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            {renderAccountAndThemePanel()}
          </div>
        </div>
      </ResponsiveSheet>

      {/* Account, Seeded Persona Switcher & Theme Sheet (Mobile + Collapsed Rail) */}
      <ResponsiveSheet
        open={accountSheetOpen}
        onOpenChange={setAccountSheetOpen}
        title="Session & Appearance"
        description={
          user
            ? `Signed in as ${user.name} (${user.email})`
            : "Switch seeded persona or appearance"
        }
        desktopVariant="drawer"
        headerIcon={
          <Link
            href="/"
            aria-label="TracTiq Home"
            onClick={() => setAccountSheetOpen(false)}
            className="inline-flex items-center rounded-[8px]"
          >
            <TracTiqLogo variant="mark" size="sm" />
          </Link>
        }
      >
        <div className="p-4 sm:p-5">{renderAccountAndThemePanel()}</div>
      </ResponsiveSheet>
    </div>
  );
}
