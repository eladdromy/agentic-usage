"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { SetupActions, SetupStepCard } from "@/components/setup/setup-shell";
import {
  TraceSyncProvider,
  useTraceSync,
} from "@/components/tracing/trace-sync-provider";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterClaudeTrace } from "@/lib/onboarding/navigation";
import { claudeTraceProgress } from "@/lib/onboarding/setup-steps";

function TraceStepBody() {
  const router = useRouter();
  const { startTraceSync, syncing, syncSnapshot } = useTraceSync();
  const [saving, setSaving] = useState(false);
  const markedRef = useRef(false);

  const finished =
    syncSnapshot?.phase === "done" || syncSnapshot?.phase === "error";

  // Persist the trace-indexed flag once the first-run index finishes.
  useEffect(() => {
    if (!finished || markedRef.current) return;
    markedRef.current = true;
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingClaudeTraceIndexed: true }),
    });
  }, [finished]);

  const indexedSessions =
    syncSnapshot?.projects.reduce(
      (sum, project) => sum + project.sessionsIndexed,
      0,
    ) ?? 0;

  return (
    <SetupStepCard
      setupProgress={claudeTraceProgress()}
      title="Index Claude Code traces"
      description="Build a local index of session interactions, requests, and per-request breakdowns. Indexing starts only when you click Start indexing. Later updates run from Tracing."
    >
      {syncing ? (
        <Surface className="p-5 text-sm text-muted-foreground">
          Indexing is running in the dialog. You can continue after it finishes.
        </Surface>
      ) : finished && syncSnapshot ? (
        <Surface className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <CircleCheck
              size={20}
              className="text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">
                {syncSnapshot.phase === "error"
                  ? "Trace indexing finished with warnings"
                  : "Trace index ready"}
              </p>
              <p className="text-sm text-muted-foreground">
                {indexedSessions > 0
                  ? `Indexed ${indexedSessions.toLocaleString()} sessions across ${syncSnapshot.projects.length.toLocaleString()} projects.`
                  : "No new sessions needed indexing."}
              </p>
            </div>
          </div>
        </Surface>
      ) : (
        <Surface className="p-5 text-sm text-muted-foreground">
          Nothing is indexed until you start. Progress stays in a dialog so this
          step stays usable.
        </Surface>
      )}

      <SetupActions>
        {!finished || syncSnapshot?.phase === "error" ? (
          <Button
            type="button"
            variant={finished ? "outline" : "default"}
            disabled={syncing}
            onClick={() => {
              void startTraceSync();
            }}
          >
            {syncing ? (
              <>
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                Indexing…
              </>
            ) : syncSnapshot?.phase === "error" ? (
              "Try again"
            ) : (
              "Start indexing"
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={!finished || saving}
          onClick={() => {
            setSaving(true);
            router.push(nextPathAfterClaudeTrace());
          }}
        >
          {saving ? (
            <>
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              Continuing…
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}

export function SetupClaudeTraceClient() {
  return (
    <TraceSyncProvider>
      <TraceStepBody />
    </TraceSyncProvider>
  );
}
