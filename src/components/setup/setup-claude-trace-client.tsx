"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { SetupActions, SetupStepCard } from "@/components/setup/setup-shell";
import {
  TraceSyncProvider,
  useTraceSync,
} from "@/components/tracing/trace-sync-provider";
import { TraceSyncProgressPanel } from "@/components/tracing/trace-sync-progress-panel";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterClaudeTrace } from "@/lib/onboarding/navigation";
import { claudeTraceProgress } from "@/lib/onboarding/setup-steps";

function TraceStepBody() {
  const router = useRouter();
  const { snapshot } = useTraceSync();
  const [saving, setSaving] = useState(false);
  const markedRef = useRef(false);

  const finished = snapshot.phase === "done" || snapshot.phase === "error";
  const indexing = snapshot.phase === "planning" || snapshot.phase === "indexing";

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

  const indexedSessions = snapshot.projects.reduce(
    (sum, project) => sum + project.sessionsIndexed,
    0,
  );

  return (
    <SetupStepCard
      setupProgress={claudeTraceProgress()}
      title="Index Claude Code traces"
      description="Building your local trace index — session interactions, requests, and per-request breakdowns. This runs once; later visits only re-parse changed sessions."
    >
      {indexing ? (
        <TraceSyncProgressPanel snapshot={snapshot} />
      ) : (
        <Surface className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <CircleCheck
              size={20}
              className="text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">
                {snapshot.phase === "error"
                  ? "Trace indexing finished with warnings"
                  : "Trace index ready"}
              </p>
              <p className="text-sm text-muted-foreground">
                {indexedSessions > 0
                  ? `Indexed ${indexedSessions.toLocaleString()} sessions across ${snapshot.projects.length.toLocaleString()} projects.`
                  : "No new sessions needed indexing."}
              </p>
            </div>
          </div>
        </Surface>
      )}

      <SetupActions>
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
