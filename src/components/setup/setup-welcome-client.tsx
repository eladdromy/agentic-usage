"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { SetupActions, SetupStepCard } from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { HarnessLogo } from "@/components/layout/harness-logo";
import { setupEntryPath } from "@/lib/onboarding/navigation";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

export function SetupWelcomeClient() {
  const router = useRouter();
  const { status, loading, error } = useOnboardingStatus();

  useEffect(() => {
    if (!status) return;
    if (status.onboardingComplete) {
      router.replace("/leverage");
    }
  }, [router, status]);

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Detecting harnesses on this machine…
      </div>
    );
  }

  const nextPath = setupEntryPath(status);

  return (
    <SetupStepCard
      title="Welcome to Agentic Usage"
      description="We'll detect your coding agent harnesses locally and walk you through indexing logs or importing billing data. Everything stays on your machine."
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Surface className="space-y-4 p-5">
        <p className="text-sm font-medium">Detected on this machine</p>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <HarnessLogo harness="claude" className="size-5" />
            {status.detected.claude ? (
              <span className="font-medium">Claude Code</span>
            ) : (
              <span className="text-muted-foreground">Claude Code — not found</span>
            )}
          </li>
          <li className="flex items-center gap-3">
            <HarnessLogo harness="cursor" className="size-5" />
            {status.detected.cursor ? (
              <span className="font-medium">Cursor</span>
            ) : (
              <span className="text-muted-foreground">Cursor — not found</span>
            )}
          </li>
        </ul>
      </Surface>

      <SetupActions>
        <Button type="button" onClick={() => router.push(nextPath)}>
          Continue
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}
