"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import { useRouteSync } from "@/components/layout/route-sync";
import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import {
  TraceSyncProvider,
  useTraceSync,
} from "@/components/tracing/trace-sync-provider";
import { SpendSyncStatusDialog } from "@/components/setup/spend-sync-status-dialog";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterClaudeSync } from "@/lib/onboarding/navigation";
import { claudeSyncProgress } from "@/lib/onboarding/setup-steps";

function SyncStepBody() {
  const router = useRouter();
  const { triggerSync, syncing } = useRouteSync();
  const { startTraceSync, openStatus, syncing: traceSyncing, syncSnapshot } =
    useTraceSync();
  const { status, loading, refresh } = useOnboardingStatus();
  const [syncStarted, setSyncStarted] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [spendStatusOpen, setSpendStatusOpen] = useState(false);
  const traceKickoff = useRef(false);
  const traceMarked = useRef(false);

  const traceMode = status?.settings.traceMode?.claude ?? "spend_only";
  const wantsTrace = traceMode === "full_tracing";

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

  useEffect(() => {
    if (!wantsTrace || traceKickoff.current) return;
    traceKickoff.current = true;
    void startTraceSync({ harness: "claude", modal: false });
  }, [startTraceSync, wantsTrace]);

  useEffect(() => {
    if (!wantsTrace || syncSnapshot?.phase !== "done" || traceMarked.current) return;
    traceMarked.current = true;
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingClaudeTraceIndexed: true }),
    });
  }, [syncSnapshot?.phase, wantsTrace]);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Preparing Claude index…
      </div>
    );
  }

  const eventCount = status?.claudeEventCount ?? 0;
  const claudeHome = status?.paths.claudeHome;
  const spendReady = !syncing && eventCount > 0;
  const traceReady = !wantsTrace || syncSnapshot?.phase === "done";
  const canContinue = spendReady && traceReady && !traceSyncing;

  return (
    <SetupStepCard
      setupProgress={claudeSyncProgress()}
      title="Index Claude"
      description={
        wantsTrace
          ? "One pass over your local logs. Spend (cost, tokens, projects) and full traces (sessions and requests) are indexed together."
          : "One pass over your local logs for spend — cost, tokens, and projects. Full session traces stay off."
      }
    >
      <Surface className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {syncing || !spendReady ? (
              <LoaderCircle size={20} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <CircleCheck size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {syncing ? "Indexing spend…" : spendReady ? "Spend index ready" : "Waiting for logs…"}
              </p>
              {syncSummary ? (
                <p className="text-sm text-muted-foreground">{syncSummary}</p>
              ) : (
                <p className="truncate text-sm text-muted-foreground">
                  {eventCount > 0
                    ? `${eventCount.toLocaleString()} usage events indexed`
                    : claudeHome
                      ? `Scanning ${claudeHome} for session logs`
                      : "Scanning Claude logs for session files"}
                </p>
              )}
            </div>
          </div>
          {syncing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSpendStatusOpen(true)}
            >
              Show status
            </Button>
          ) : null}
        </div>

        {wantsTrace ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {traceReady ? (
                <CircleCheck size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : syncSnapshot?.phase === "error" ? (
                <CircleX size={20} className="shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <LoaderCircle size={20} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {syncSnapshot?.phase === "error"
                    ? "Trace index stopped"
                    : traceReady
                      ? "Trace index ready"
                      : "Indexing traces…"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {syncSnapshot?.phase === "error"
                    ? "Retry to parse local session logs."
                    : traceReady
                      ? "Sessions and requests are in the trace database."
                      : "Sessions and requests from local logs."}
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

      <SpendSyncStatusDialog
        open={spendStatusOpen}
        syncing={syncing}
        onClose={() => setSpendStatusOpen(false)}
      />

      <SetupActions>
        {syncSnapshot?.phase === "error" ? (
          <Button
            type="button"
            onClick={() => {
              void startTraceSync({ harness: "claude", modal: false });
            }}
          >
            Retry trace index
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!canContinue}
            onClick={() => router.push(nextPathAfterClaudeSync())}
          >
            Continue
          </Button>
        )}
      </SetupActions>
    </SetupStepCard>
  );
}

export function SetupClaudeSyncClient() {
  return (
    <TraceSyncProvider>
      <SyncStepBody />
    </TraceSyncProvider>
  );
}
