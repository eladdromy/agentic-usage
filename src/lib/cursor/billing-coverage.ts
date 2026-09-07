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
  buildCsvExportPeriods,
  buildMissingMonths,
  buildUploadedMonths,
  buildMissingDayRanges,
  buildUploadedDayRanges,
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

  const exportAll = dataRange
    ? toExportRange(dataRange.from, dataRange.to)
    : null;

  let extendToToday: BillingExportAll | null = null;
  const trailingMissing = missingMonths[missingMonths.length - 1];
  if (trailingMissing && dataRange && trailingMissing.month === today.slice(0, 7)) {
    extendToToday = {
      from: trailingMissing.from,
      to: trailingMissing.to,
      exportUrl: trailingMissing.exportUrl,
    };
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
    imports: queryProviderUsageImports(),
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
    total: stats.total,
    matched: stats.matched,
    unmatched: stats.unmatched,
    unmatchedPreview,
  };
}

/** @deprecated CSV-only mode has no log gaps; always false */
export function monthHasBillingGap(_month: string): boolean {
  return false;
}
