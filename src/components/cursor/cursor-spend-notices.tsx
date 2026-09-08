"use client";

import { useState } from "react";

import { CursorBillingBanner } from "@/components/cursor/cursor-billing-banner";
import { CursorSpendAlerts } from "@/components/cursor/cursor-spend-alerts";
import { startProjectSyncRun } from "@/components/cursor/project-sync-run";
import {
  showCsvUploadToast,
  waitForUploadToast,
} from "@/lib/cursor/csv-upload-feedback";
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
  const [syncingProjects, setSyncingProjects] = useState(false);

  function runProjectSync(options: {
    dateFrom?: string | null;
    dateTo?: string | null;
    retryUnmatched?: boolean;
  } = {}) {
    void startProjectSyncRun({
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      retryUnmatched: options.retryUnmatched,
      onSyncingChange: setSyncingProjects,
      onComplete: () => onRefresh?.(),
    });
  }

  async function handleUploaded(result: ProviderUsageUploadResult) {
    const outcome = showCsvUploadToast(result);
    onRefresh?.();
    if (outcome === "duplicate") return;

    await waitForUploadToast();
    runProjectSync({ dateFrom: result.dateFrom, dateTo: result.dateTo });
  }

  return (
    <>
      <CursorBillingBanner coverage={coverage} onUploaded={handleUploaded} />
      {coverage?.costSourceAvailable ? (
        <CursorSpendAlerts
          coverage={coverage}
          syncingProjects={syncingProjects}
          onSyncProjects={() => runProjectSync({ retryUnmatched: true })}
        />
      ) : null}
    </>
  );
}
