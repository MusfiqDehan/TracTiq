"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Radio,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  const { user, seededUsers, switchUser } = useAuth();
  const router = useRouter();

  const handleEnterAs = async (userId: string) => {
    const profile = await switchUser(userId);
    const targetTeam = profile.teams[0]?.id || "team_lead";
    router.push(`/teams/${targetTeam}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(20,184,166,0.22),transparent_48%),radial-gradient(circle_at_80%_75%,rgba(59,130,246,0.16),transparent_45%)]" />
        <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:py-24">
          <div className="space-y-6 lg:col-span-7">
            <Badge variant="accent" className="border-teal-500/40 bg-teal-500/15 text-teal-300">
              EOS Operating System · Real-Time Level 10 Sync
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Run sharper weekly meetings. Turn off-track numbers into solved Issues.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              TracTiq connects your 13-week Scorecard, quarterly Rocks, 7-day To-Dos, and
              Level 10 Meetings in one real-time workspace—with server-authoritative timers,
              zero-duplicate Issue tracking, and strict server-enforced team boundaries.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link href={`/teams/${user?.teams[0]?.id || "team_lead"}`}>
                <Button size="lg" variant="accent" className="gap-2">
                  Open {user?.teams[0]?.name || "Leadership"} Workspace
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href={`/teams/${user?.teams[0]?.id || "team_lead"}/meeting`}>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                >
                  <Radio className="h-4 w-4 text-teal-400" />
                  Launch Level 10 Meeting
                </Button>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <Card className="border-white/15 bg-white/5 text-white backdrop-blur-md">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
                    The 75-Minute Level 10 Agenda
                  </span>
                  <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
                    WebSocket Synced
                  </Badge>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      step: "1. Scorecard Review",
                      dur: "5 min",
                      desc: "Inspect last closed week numbers and flag off-track cells as Issues.",
                    },
                    {
                      step: "2. IDS (Identify · Discuss · Solve)",
                      dur: "60 min",
                      desc: "Work Issues in priority order, capture 7-day To-Dos, and record resolution notes.",
                    },
                    {
                      step: "3. Conclude & Summary",
                      dur: "10 min",
                      desc: "Recap new To-Dos, submit 1–10 team ratings, and freeze the meeting snapshot.",
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="rounded-xl border border-white/10 bg-slate-900/70 p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{item.step}</span>
                        <span className="font-mono text-xs font-bold text-teal-400">
                          {item.dur}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: BarChart3,
              title: "Measure Weekly",
              body: "13-week trailing Scorecard in America/Chicago time with inline editing and instant goal tracking.",
            },
            {
              icon: Target,
              title: "Commit Quarterly",
              body: "Track Q4 Rocks and Milestones with real-time progress percentages and past-due detection.",
            },
            {
              icon: CheckCircle2,
              title: "Resolve Without Duplicates",
              body: "Turn off-track Measurables, Rocks, or overdue To-Dos into Issues protected by DB partial unique indexes.",
            },
            {
              icon: ShieldCheck,
              title: "Zero-Trust RBAC & Audit",
              body: "JWT access/refresh auth, team membership enforcement, Observer read-only guards, and full audit logs.",
            },
          ].map((feat) => (
            <Card key={feat.title} className="border-slate-200 bg-white">
              <CardContent className="space-y-2.5 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <feat.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-slate-950">{feat.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{feat.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Seeded User Quick Switcher */}
      <section className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" />
              <h2 className="text-xl font-bold tracking-tight text-slate-950">
                Seeded Account Switcher (JWT Auth)
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Select any seeded persona to mint real JWT access & refresh tokens and test
              Admin, Team Member, or Observer permissions.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            <span>Acme Logistics · America/Chicago</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {seededUsers.map((su) => (
            <Card
              key={su.id}
              className="transition-all hover:border-teal-400 hover:shadow-sm"
            >
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-900">
                      {su.name}
                    </span>
                    <Badge
                      variant={
                        su.role === "admin"
                          ? "default"
                          : su.role === "observer"
                            ? "warning"
                            : "accent"
                      }
                    >
                      {su.role.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{su.email}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    Teams: {su.team_ids.join(", ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={user?.id === su.id ? "accent" : "outline"}
                  onClick={() => handleEnterAs(su.id)}
                  data-testid={`enter-as-${su.id}`}
                >
                  Enter
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700">
            <Layers className="h-3.5 w-3.5 text-teal-600" />
            TracTiq EOS Platform
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            <span>Clock anchored to APP_NOW in America/Chicago</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
