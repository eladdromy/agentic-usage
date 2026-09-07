import { buildBillingCoveragePayload } from "@/lib/cursor/billing-coverage";
import { anonymizeRawSpendApiRow } from "@/lib/demo/anonymize-api-payloads";
import type { ProviderUsageParsedRow } from "@/lib/cursor/provider-usage-types";
import {
  formatCursorRowCostsSplit,
  numericApiEqUsdFromProviderRow,
} from "@/lib/pricing/cursor-usage-cost";
import { projectLabelsFromPath } from "@/lib/cursor/project-attribution";
import {
  getLastProviderImportAt,
  queryProviderUsageEventsForRawSpend,
} from "@/lib/cursor/provider-usage-db";
import type { UsageEventRow } from "@/lib/claude/types";
import {
  decodeProjectSlugForDisplay,
  projectNameFromSlug,
} from "@/lib/claude/project-slugs";
import {
  ensureSynced,
  getEventCount,
  getLastSyncAt,
  queryRawSpendRows,
  type RawSpendSort,
} from "@/lib/db/usage-db";
import {
  formatClaudeBillingCostLabel,
  formatApiEqCostLabel,
  formatDateTime,
  formatTokenCount,
  numericApiEqUsd,
  shortComposerId,
  shortSessionId,
  toRelativeTimeAgo,
} from "@/lib/format";
import type { HarnessKind } from "@/lib/profile/settings";

export type RawSpendApiRow = {
  id: number;
  harness: HarnessKind;
  rowKey: string;
  createdAt: string;
  createdAtLabel: string;
  createdAgo: string | null;
  sourceLabel: string;
  sourceDetail?: string | null;
  refLabel?: string;
  model: string;
  inputTokensLabel: string;
  cacheWriteLabel: string;
  cacheReadLabel: string;
  outputTokensLabel: string;
  totalTokensLabel: string;
  billingCostLabel: string;
  apiEqCostLabel: string;
  calculatedCostUsd: number;
  sortDateSec: number;
};

type MergeOptions = {
  fromSec?: number;
  toSec?: number;
  sort: RawSpendSort;
  project?: string;
  model?: string;
  offset: number;
  limit: number;
};

function mapClaudeRow(row: UsageEventRow): RawSpendApiRow {
  const calculatedCostUsd = numericApiEqUsd(row.costUsd, row.calculatedCostUsd);
  const mapped: RawSpendApiRow = {
    id: row.id,
    harness: "claude",
    rowKey: `claude-${row.id}`,
    createdAt: row.dateIso,
    createdAtLabel: formatDateTime(row.dateIso),
    createdAgo: toRelativeTimeAgo(row.dateIso),
    sourceLabel: projectNameFromSlug(row.projectSlug),
    sourceDetail: decodeProjectSlugForDisplay(row.projectSlug),
    refLabel: shortSessionId(row.sessionId),
    model: row.model,
    inputTokensLabel: formatTokenCount(row.inputWithoutCacheWrite ?? 0),
    cacheWriteLabel: formatTokenCount(row.inputWithCacheWrite ?? 0),
    cacheReadLabel: formatTokenCount(row.cacheRead ?? 0),
    outputTokensLabel: formatTokenCount(row.outputTokens ?? 0),
    totalTokensLabel: formatTokenCount(row.totalTokens ?? 0),
    billingCostLabel: formatClaudeBillingCostLabel(row.costUsd),
    apiEqCostLabel: formatApiEqCostLabel(row.costUsd, row.calculatedCostUsd),
    calculatedCostUsd,
    sortDateSec: row.dateSec,
  };

  return {
    ...mapped,
    ...anonymizeRawSpendApiRow(mapped, row.projectSlug, row.sessionId),
    calculatedCostUsd,
    sortDateSec: row.dateSec,
  };
}

function mapCursorRow(row: ProviderUsageParsedRow & { id: number }): RawSpendApiRow {
  const costs = formatCursorRowCostsSplit(row);
  const project = projectLabelsFromPath(row.project);
  const calculatedCostUsd = numericApiEqUsdFromProviderRow(row);
  const sessionRef = row.composerId || row.cloudAgentId || "";
  const mapped: RawSpendApiRow = {
    id: row.id,
    harness: "cursor",
    rowKey: `cursor-${row.id}`,
    createdAt: row.date,
    createdAtLabel: formatDateTime(row.date),
    createdAgo: toRelativeTimeAgo(row.date),
    sourceLabel: project.label,
    sourceDetail: project.detail,
    refLabel: shortComposerId(sessionRef),
    model: row.model || "—",
    inputTokensLabel: formatTokenCount(row.inputWithoutCacheWrite ?? 0),
    cacheWriteLabel: formatTokenCount(row.inputWithCacheWrite ?? 0),
    cacheReadLabel: formatTokenCount(row.cacheRead ?? 0),
    outputTokensLabel: formatTokenCount(row.outputTokens ?? 0),
    totalTokensLabel: formatTokenCount(row.totalTokens ?? 0),
    billingCostLabel: costs.billingLabel,
    apiEqCostLabel: costs.apiEqLabel,
    calculatedCostUsd,
    sortDateSec: Date.parse(row.date) / 1000,
  };

  return {
    ...mapped,
    ...anonymizeRawSpendApiRow(mapped, row.project ?? project.label, sessionRef),
    calculatedCostUsd,
    sortDateSec: Date.parse(row.date) / 1000,
  };
}

function sortMergedRows(rows: RawSpendApiRow[], sort: RawSpendSort): RawSpendApiRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "highest_spend") {
      if (b.calculatedCostUsd !== a.calculatedCostUsd) {
        return b.calculatedCostUsd - a.calculatedCostUsd;
      }
      return b.sortDateSec - a.sortDateSec;
    }
    return b.sortDateSec - a.sortDateSec;
  });
}

export async function queryAllHarnessRawSpend(options: MergeOptions): Promise<{
  harness: "all";
  rows: Omit<RawSpendApiRow, "calculatedCostUsd" | "sortDateSec">[];
  total: number;
  lastSyncAt: string | null;
  lastImportAt: string | null;
  eventCount: number;
  costSourceAvailable: boolean;
  needsCsv: boolean;
  billingCoverage: ReturnType<typeof buildBillingCoveragePayload>;
}> {
  await ensureSynced();

  const coverage = buildBillingCoveragePayload();
  const fromSec = options.fromSec ?? 0;
  const toSec = options.toSec ?? Math.floor(Date.now() / 1000);
  const fetchCount = options.offset + options.limit;

  const claude = queryRawSpendRows({
    fromSec: options.fromSec,
    toSec: options.toSec,
    projectSlug: options.project,
    model: options.model,
    sort: options.sort,
    offset: 0,
    limit: fetchCount,
  });

  const cursor = queryProviderUsageEventsForRawSpend({
    fromSec,
    toSec,
    project: options.project,
    model: options.model,
    sort: options.sort,
    offset: 0,
    limit: fetchCount,
  });

  const merged = sortMergedRows(
    [
      ...claude.rows.map(mapClaudeRow),
      ...cursor.rows.map(mapCursorRow),
    ],
    options.sort,
  );

  const rows = merged.slice(options.offset, options.offset + options.limit).map(
    ({ sortDateSec: _sortDateSec, calculatedCostUsd: _calculatedCostUsd, ...row }) =>
      row,
  );

  return {
    harness: "all",
    rows,
    total: claude.total + cursor.total,
    lastSyncAt: getLastSyncAt(),
    lastImportAt: getLastProviderImportAt(),
    eventCount: getEventCount() + cursor.total,
    costSourceAvailable: true,
    needsCsv: coverage.needsCsv,
    billingCoverage: coverage,
  };
}
