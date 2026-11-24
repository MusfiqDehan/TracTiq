"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiRequest,
  getStoredTokens,
  storeTokens,
} from "@/lib/api-client";
import type {
  AuthTokenBundle,
  SeededUserSummary,
  UserProfile,
} from "@/lib/types";

interface AuthContextValue {
  user: UserProfile | null;
  accessToken: string | null;
  seededUsers: SeededUserSummary[];
  loading: boolean;
  switchUser: (userId: string) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [seededUsers, setSeededUsers] = useState<SeededUserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const switchUser = useCallback(
    async (userId: string): Promise<UserProfile> => {
      const res = await apiRequest<AuthTokenBundle>("/api/auth/switch", {
        method: "POST",
        body: { user_id: userId },
        skipAuth: true,
      });
      storeTokens(res.data);
      setAccessToken(res.data.access_token);
      setUser(res.data.user);
      queryClient.clear();
      return res.data.user;
    },
    [queryClient]
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const usersRes = await apiRequest<SeededUserSummary[]>("/api/auth/users", {
          skipAuth: true,
        });
        if (!active) return;
        setSeededUsers(usersRes.data);

        const urlParams =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : null;
        const asUser = urlParams?.get("as");
        const stored = getStoredTokens();

        if (asUser && usersRes.data.some((u) => u.id === asUser)) {
          await switchUser(asUser);
          return;
        }

        if (stored.accessToken) {
          try {
            const meRes = await apiRequest<UserProfile>("/api/auth/me");
            if (!active) return;
            setAccessToken(getStoredTokens().accessToken);
            setUser(meRes.data);
            return;
          } catch {
            // fall through to default seeded user
          }
        }

        await switchUser("u1");
      } catch {
        // backend unavailable during static/unit render
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [switchUser]);

  const value = useMemo(
    () => ({ user, accessToken, seededUsers, loading, switchUser }),
    [user, accessToken, seededUsers, loading, switchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
