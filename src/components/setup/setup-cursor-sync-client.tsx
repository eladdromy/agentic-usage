"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import { ProjectSyncMonthDialog } from "@/components/cursor/project-sync-month-dialog";
import { ProjectSyncProgressPanel } from "@/components/cursor/project-sync-progress-panel";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import {
  TraceSyncProvider,
  useTraceSync,
} from "@/components/tracing/trace-sync-provider";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterCursorSync } from "@/lib/onboarding/navigation";
import { CURSOR_SETUP_STEPS } from "@/lib/onboarding/setup-steps";

function CursorSyncStep() {
  const router = useRouter();
  const { startProjectSync, syncSnapshot: projectSnapshot } = useProjectSync();
  const {
    startTraceSync,
    openStatus,
    syncing: traceSyncing,
    syncSnapshot: traceSnapshot,
  } = useTraceSync();
  const { status } = useOnboardingStatus();
  const syncStartedRef = useRef(false);
  const traceKickoff = useRef(false);
  const traceMarked = useRef(false);
  const [matchStatusOpen, setMatchStatusOpen] = useState(false);

  const modeKnown = status != null;
  const wantsTrace = status?.settings.traceMode?.cursor === "full_tracing";
  const traceAlreadyIndexed = status?.settings.onboardingCursorTraceIndexed === true;

  useEffect(() => {
    if (syncStartedRef.current) return;
    syncStartedRef.current = true;
    void startProjectSync({ modal: false });
  }, [startProjectSync]);

  useEffect(() => {
    if (!wantsTrace || traceAlreadyIndexed || traceKickoff.current) return;
    traceKickoff.current = true;
    void startTraceSync({ harness: "cursor", modal: false });
  }, [startTraceSync, traceAlreadyIndexed, wantsTrace]);

  useEffect(() => {
    if (!wantsTrace || traceSnapshot?.phase !== "done" || traceMarked.current) return;
    traceMarked.current = true;
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCursorTraceIndexed: true }),
    });
  }, [traceSnapshot?.phase, wantsTrace]);

  const finished = projectSnapshot?.finished ?? false;
  const failed = projectSnapshot?.status === "error";
  const traceReady = !wantsTrace || traceAlreadyIndexed || traceSnapshot?.phase === "done";
  const canContinue = modeKnown && finished && !failed && traceReady && !traceSyncing;

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
      title="Index Cursor"
      description={
        wantsTrace
          ? "Matching CSV rows to local Cursor workspaces, and indexing composer sessions for tracing."
          : "Matching CSV rows to local Cursor workspaces. First run may build a one-time conversation index."
      }
    >
      <Surface className="space-y-4 p-5">
        {projectSnapshot ? (
          <div className="space-y-3">
            <ProjectSyncProgressPanel
              phase={projectSnapshot.phase}
              preparingStep={projectSnapshot.preparingStep}
              months={projectSnapshot.months}
              finished={finished}
              bubbleIndexReady={projectSnapshot.bubbleIndexReady}
              uploadSummary={null}
              hideMonthList
              retainPrepSteps
              includeMatchingStep
              matchingStatusAction={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMatchStatusOpen(true)}
                >
                  Show status
                </Button>
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Starting project sync…</p>
        )}

        {wantsTrace ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              {traceReady ? (
                <CircleCheck size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : traceSnapshot?.phase === "error" ? (
                <CircleX size={20} className="shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <LoaderCircle size={20} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {traceSnapshot?.phase === "error"
                    ? "Trace index stopped"
                    : traceReady
                      ? "Trace index ready"
                      : "Indexing traces…"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {traceSnapshot?.phase === "error"
                    ? "Retry to parse local composer sessions."
                    : traceReady
                      ? "Composer sessions are in the trace database."
                      : "Sessions and requests from local Cursor state."}
                </p>
              </div>
            </div>
            {traceSyncing ? (
              <Button type="button" variant="outline" size="sm" onClick={openStatus}>
                Show status
              </Button>
            ) : null}
          </div>
        ) : null}
      </Surface>

      <ProjectSyncMonthDialog
        open={matchStatusOpen}
        months={projectSnapshot?.months ?? []}
        finished={finished}
        onClose={() => setMatchStatusOpen(false)}
      />

      <SetupActions>
        {traceSnapshot?.phase === "error" ? (
          <Button
            type="button"
            onClick={() => {
              void startTraceSync({ harness: "cursor", modal: false });
            }}
          >
            Retry trace index
          </Button>
        ) : (
          <Button type="button" disabled={!canContinue} onClick={() => void handleContinue()}>
            Continue
          </Button>
        )}
      </SetupActions>
    </SetupStepCard>
  );
}

export function SetupCursorSyncClient() {
  return (
    <TraceSyncProvider>
      <CursorSyncStep />
    </TraceSyncProvider>
  );
}
