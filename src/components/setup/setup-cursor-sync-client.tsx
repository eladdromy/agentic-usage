"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { ProjectSyncProgressPanel } from "@/components/cursor/project-sync-progress-panel";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterCursorSync } from "@/lib/onboarding/navigation";
import { CURSOR_SETUP_STEPS } from "@/lib/onboarding/setup-steps";

export function SetupCursorSyncClient() {
  const router = useRouter();
  const { startProjectSync, syncSnapshot } = useProjectSync();
  const syncStartedRef = useRef(false);

  useEffect(() => {
    if (syncStartedRef.current) return;
    syncStartedRef.current = true;
    void startProjectSync({ modal: false });
  }, [startProjectSync]);

  const finished = syncSnapshot?.finished ?? false;
  const failed = syncSnapshot?.status === "error";

  async function handleContinue() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCursorProjectSyncDone: true }),
    });
    router.push(nextPathAfterCursorSync());
  }

  return (
    <SetupStepCard
      setupProgress={CURSOR_SETUP_STEPS.sync}
      title="Link billing to projects"
      description="Matching CSV rows to local Cursor workspaces. First run may build a one-time conversation index."
    >
      <Surface className="p-5">
        {syncSnapshot ? (
          <ProjectSyncProgressPanel
            phase={syncSnapshot.phase}
            preparingStep={syncSnapshot.preparingStep}
            months={syncSnapshot.months}
            finished={finished}
            bubbleIndexReady={syncSnapshot.bubbleIndexReady}
            uploadSummary={null}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Starting project sync…</p>
        )}
      </Surface>

      <SetupActions>
        <Button type="button" disabled={!finished || failed} onClick={() => void handleContinue()}>
          Continue
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}
