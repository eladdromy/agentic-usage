"use client";

import { useRouter } from "next/navigation";

import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";

export function SetupCursorOfferClient() {
  const router = useRouter();

  async function skipCursor() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingDeferredCursor: true }),
    });
    await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deferredCursor: true }),
    });
    router.push("/leverage");
  }

  return (
    <SetupStepCard
      title="Set up Cursor too?"
      description="Claude Code is ready. Cursor needs a billing CSV import and project sync — you can do that now or later from Plan Leverage."
    >
      <SetupActions>
        <Button type="button" variant="outline" onClick={() => void skipCursor()}>
          Skip for now
        </Button>
        <Button type="button" onClick={() => router.push("/setup/cursor/upload")}>
          Set up Cursor
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}
