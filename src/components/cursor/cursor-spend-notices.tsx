"use client";

import { CursorSpendAlerts } from "@/components/cursor/cursor-spend-alerts";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";

export function CursorSpendNotices({
  coverage,
  onRefresh,
}: {
  coverage: BillingCoveragePayload | null;
  /** Reload spend data (after sync completes). */
  onRefresh?: () => void;
}) {
  const { startProjectSync, syncing } = useProjectSync();

  function runProjectSync() {
    void startProjectSync({
      retryUnmatched: true,
      onComplete: () => onRefresh?.(),
    });
  }

  if (!coverage?.costSourceAvailable) return null;

  return (
    <CursorSpendAlerts
      coverage={coverage}
      syncingProjects={syncing}
      onSyncProjects={runProjectSync}
    />
  );
}
