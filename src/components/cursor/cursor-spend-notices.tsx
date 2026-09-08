"use client";

import { CursorBillingBanner } from "@/components/cursor/cursor-billing-banner";
import { CursorSpendAlerts } from "@/components/cursor/cursor-spend-alerts";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";

export function CursorSpendNotices({
  coverage,
  onRefresh,
}: {
  coverage: BillingCoveragePayload | null;
  /** Reload spend data (after sync completes). */
  onRefresh?: () => void;
}) {
  const { startProjectSync, syncing } = useProjectSync();

  function handleUploaded(_result: ProviderUsageUploadResult) {
    onRefresh?.();
  }

  function runProjectSync() {
    void startProjectSync({
      retryUnmatched: true,
      onComplete: () => onRefresh?.(),
    });
  }

  return (
    <>
      <CursorBillingBanner
        coverage={coverage}
        onUploaded={handleUploaded}
        onSyncComplete={onRefresh}
      />
      {coverage?.costSourceAvailable ? (
        <CursorSpendAlerts
          coverage={coverage}
          syncingProjects={syncing}
          onSyncProjects={runProjectSync}
        />
      ) : null}
    </>
  );
}
