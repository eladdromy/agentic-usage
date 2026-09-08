"use client";

import { useCallback, useEffect, useState } from "react";

import type { OnboardingStatus } from "@/lib/onboarding/status";

export function useOnboardingStatus(pollMs?: number) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/status");
      if (!res.ok) throw new Error("Failed to load setup status");
      const json = (await res.json()) as OnboardingStatus;
      setStatus(json);
      setError(null);
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load setup status");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, refresh]);

  return { status, loading, error, refresh };
}
