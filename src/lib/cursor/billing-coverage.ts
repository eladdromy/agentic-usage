import {
  providerUsageDbHasRows,
  queryProjectAttributionStats,
  queryProviderUsageBounds,
  queryProviderUsageDays,
  queryProviderUsageImports,
  queryProjectSyncMonths,
  queryUnmatchedBillingEvents,
} from "@/lib/cursor/provider-usage-db";
import {
  toUnmatchedBillingRow,
  type UnmatchedBillingRow,
} from "@/lib/cursor/billing-project-attach";
import { isVscdbAvailableForAttribution } from "@/lib/cursor/vscdb-bubbles";
import {
  buildBillingCoverageFromImports,
  buildCsvExportPeriods,
  buildMissingMonths,
  buildUploadedMonths,
  cursorUsageDashboardUrl,
  type BillingCoveragePayload,
  type BillingExportAll,
  type BillingGapRange,
  type BillingMonthRange,
  type BillingPeriodRange,
} from "@/lib/cursor/billing-coverage-shared";

export type {
  BillingCoveragePayload,
  BillingExportAll,
  BillingGapRange,
  BillingMonthRange,
  BillingPeriodRange,
} from "@/lib/cursor/billing-coverage-shared";

export {
  buildBillingCoverageFromImports,
  buildCsvExportPeriods,
  buildMissingMonths,
  buildUploadedMonths,
  buildMissingDayRanges,
  buildUploadedRangesFromImportSpans,
  billingImportRecordsToSpans,
  cursorUsageDashboardUrl,
  formatBillingDayRange,
  formatBillingMonthLabel,
  formatBillingMonthRange,
} from "@/lib/cursor/billing-coverage-shared";

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function toExportRange(from: string, to: string): BillingExportAll {
  return {
    from,
    to,
    exportUrl: `https://cursor.com/dashboard/usage?${new URLSearchParams({ from, to }).toString()}`,
  };
}

export function buildBillingCoveragePayload(): BillingCoveragePayload {
  const csvDays = queryProviderUsageDays();
  const costSourceAvailable = providerUsageDbHasRows();
  const bounds = queryProviderUsageBounds();
  const periods = buildCsvExportPeriods(csvDays);
  const uploadedMonths = buildUploadedMonths(csvDays);
  const today = utcToday();
  const missingMonths = buildMissingMonths(csvDays, today);
  const projectSyncPending = queryProjectSyncMonths().reduce(
    (sum, row) => sum + row.pendingRows,
    0,
  );

  const sortedDays = [...csvDays].sort();
  const dataRange =
    sortedDays.length > 0
      ? { from: sortedDays[0]!, to: sortedDays[sortedDays.length - 1]! }
      : null;

  const imports = queryProviderUsageImports();
  const { uploadedRanges, missingRanges } = buildBillingCoverageFromImports(
    imports,
    today,
  );

  const exportAll =
    uploadedRanges.length > 0
      ? toExportRange(
          uploadedRanges[0]!.from,
          uploadedRanges[uploadedRanges.length - 1]!.to,
        )
      : dataRange
        ? toExportRange(dataRange.from, dataRange.to)
        : null;

  let extendToToday: BillingExportAll | null = null;
  const trailingMissing = missingRanges[missingRanges.length - 1];
  if (trailingMissing && trailingMissing.to === today) {
    extendToToday = trailingMissing;
  }

  return {
    costSourceAvailable,
    needsCsv: !costSourceAvailable,
    csvBounds: bounds,
    csvDays,
    dataRange,
    uploadedMonths,
    missingMonths,
    periods,
    exportAll,
    extendToToday,
    imports,
    projectAttribution: buildProjectAttributionPayload(),
    projectSyncPending,
  };
}

function buildProjectAttributionPayload(): BillingCoveragePayload["projectAttribution"] {
  const stats = queryProjectAttributionStats();
  const unmatchedPreview = queryUnmatchedBillingEvents(50)
    .map((row) => toUnmatchedBillingRow(row))
    .filter((row): row is UnmatchedBillingRow => row != null);

  return {
    vscdbAvailable: isVscdbAvailableForAttribution(),
    total: stats.total ?? 0,
    matched: stats.matched ?? 0,
    unmatched: stats.unmatched ?? 0,
    unmatchedPreview,
  };
}

/** @deprecated CSV-only mode has no log gaps; always false */
export function monthHasBillingGap(_month: string): boolean {
  return false;
}
