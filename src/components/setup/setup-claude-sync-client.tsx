"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { useRouteSync } from "@/components/layout/route-sync";
import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterClaudeSync } from "@/lib/onboarding/navigation";
import { CLAUDE_SETUP_STEPS } from "@/lib/onboarding/setup-steps";

export function SetupClaudeSyncClient() {
  const router = useRouter();
  const { triggerSync, syncing } = useRouteSync();
  const { status, loading, refresh } = useOnboardingStatus(2000);
  const [syncStarted, setSyncStarted] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  useEffect(() => {
    if (syncStarted) return;

    async function run() {
      setSyncStarted(true);
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeHarness: "claude", syncMethod: "full" }),
      });
      const result = await triggerSync();
      if (result?.rowsInserted != null || result?.filesScanned != null) {
        setSyncSummary(
          `Indexed ${(result.rowsInserted ?? 0).toLocaleString()} events from ${(result.filesScanned ?? 0).toLocaleString()} log files`,
        );
      }
      await refresh();
    }

    void run();
  }, [refresh, syncStarted, triggerSync]);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Preparing Claude log sync…
      </div>
    );
  }

  const eventCount = status?.claudeEventCount ?? 0;
  const claudeHome = status?.paths.claudeHome;
  const canContinue = !syncing && eventCount > 0;

  return (
    <SetupStepCard
      setupProgress={CLAUDE_SETUP_STEPS.sync}
      title="Index Claude Code logs"
      description="We're reading your local JSONL session logs. This runs once on your machine — no data leaves your computer."
    >
      <Surface className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          {syncing ? (
            <LoaderCircle size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
          ) : eventCount > 0 ? (
            <CircleCheck size={20} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <LoaderCircle size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-medium">
              {syncing ? "Indexing Claude logs…" : eventCount > 0 ? "Indexing complete" : "Waiting for logs…"}
            </p>
            {syncSummary ? (
              <p className="text-sm text-muted-foreground">{syncSummary}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {eventCount > 0
                  ? `${eventCount.toLocaleString()} usage events indexed`
                  : claudeHome
                    ? `Scanning ${claudeHome} for session logs`
                    : "Scanning Claude logs for session files"}
              </p>
            )}
          </div>
        </div>
      </Surface>

      <SetupActions>
        <Button
          type="button"
          disabled={!canContinue}
          onClick={() => router.push(nextPathAfterClaudeSync(status!))}
        >
          Continue
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}
