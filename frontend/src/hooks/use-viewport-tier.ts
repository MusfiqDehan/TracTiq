"use client";

import { useSyncExternalStore } from "react";

export type ViewportTier = "mobile" | "tablet" | "desktop";

function getSnapshot(): ViewportTier {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function getServerSnapshot(): ViewportTier {
  return "desktop";
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onResize = () => callback();
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

export function useViewportTier(): ViewportTier {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
