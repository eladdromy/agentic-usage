"use client";

import { useEffect, useState } from "react";

import { CursorBillingBanner } from "@/components/cursor/cursor-billing-banner";
import { CursorSpendAlerts } from "@/components/cursor/cursor-spend-alerts";
import { runProjectSyncByMonth } from "@/lib/cursor/project-sync-client";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";

export function CursorSpendNotices({
  coverage,
  syncKey = 0,
  onRefresh,
  onUpload,
}: {
  coverage: BillingCoveragePayload | null;
  syncKey?: number;
  /** Reload spend data (after sync completes). */
  onRefresh?: () => void;
  /** After CSV upload — reload and start project sync. */
  onUpload?: () => void;
}) {
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [manualSyncKey, setManualSyncKey] = useState(0);

  const activeSyncKey = syncKey + manualSyncKey;

  useEffect(() => {
    if (activeSyncKey === 0) return;

    let cancelled = false;

    async function run() {
      setSyncingProjects(true);
      try {
        await runProjectSyncByMonth({
          onMonthChange: () => {},
        });
        if (!cancelled) onRefresh?.();
      } finally {
        if (!cancelled) setSyncingProjects(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeSyncKey, onRefresh]);

  return (
    <>
      <CursorBillingBanner coverage={coverage} onUploaded={onUpload} />
      {coverage?.costSourceAvailable ? (
        <CursorSpendAlerts
          coverage={coverage}
          syncingProjects={syncingProjects}
          onSyncProjects={() => setManualSyncKey((k) => k + 1)}
        />
      ) : null}
    </>
  );
}
