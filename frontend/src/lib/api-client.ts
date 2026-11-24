import type { ApiErrorBody, ApiResponse, AuthTokenBundle } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8003";

const STORAGE_KEYS = {
  access: "tractiq_access_token",
  refresh: "tractiq_refresh_token",
  userId: "tractiq_user_id",
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code || "API_ERROR";
    this.details = body.details;
    this.requestId = body.request_id || "";
  }
}

export function getStoredTokens(): {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, userId: null };
  }
  return {
    accessToken: window.sessionStorage.getItem(STORAGE_KEYS.access),
    refreshToken: window.sessionStorage.getItem(STORAGE_KEYS.refresh),
    userId: window.sessionStorage.getItem(STORAGE_KEYS.userId),
  };
}

export function storeTokens(bundle: AuthTokenBundle): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEYS.access, bundle.access_token);
  window.sessionStorage.setItem(STORAGE_KEYS.refresh, bundle.refresh_token);
  window.sessionStorage.setItem(STORAGE_KEYS.userId, bundle.user.id);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEYS.access);
  window.sessionStorage.removeItem(STORAGE_KEYS.refresh);
  window.sessionStorage.removeItem(STORAGE_KEYS.userId);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const parsed = (await res.json()) as ApiResponse<AuthTokenBundle>;
      storeTokens(parsed.data);
      return parsed.data.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  ifMatchVersion?: number | null;
  skipAuth?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, ifMatchVersion, skipAuth = false } = options;

  const makeHeaders = (token: string | null): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (!skipAuth && token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (ifMatchVersion !== undefined && ifMatchVersion !== null) {
      headers["If-Match"] = `W/"${ifMatchVersion}"`;
    }
    return headers;
  };

  const { accessToken } = getStoredTokens();
  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: makeHeaders(accessToken),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipAuth) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: makeHeaders(renewed),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    let errBody: ApiErrorBody = {
      code: "HTTP_ERROR",
      message: res.statusText || "Request failed",
      details: [],
      request_id: "",
    };
    try {
      const json = (await res.json()) as { error?: ApiErrorBody };
      if (json.error) errBody = json.error;
    } catch {
      // keep default
    }
    throw new ApiError(res.status, errBody);
  }

  return (await res.json()) as ApiResponse<T>;
}

export function getWsBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, "");
  }
  return API_BASE.replace(/^http/, "ws");
}
