"use client";

import { useEffect } from "react";

/** Marks that the setup wizard has started (legacy vs in-progress detection). */
export function SetupOnboardingSession() {
  useEffect(() => {
    void fetch("/api/onboarding/start", { method: "POST" });
  }, []);

  return null;
}
