import { NextResponse } from "next/server";

import { buildBillingCoveragePayload } from "@/lib/cursor/billing-coverage";
import {
  formatCursorRowCostsSplit,
  numericApiEqUsdFromProviderRow,
} from "@/lib/pricing/cursor-usage-cost";
import { projectLabelsFromPath } from "@/lib/cursor/project-attribution";
import {
  getLastProviderImportAt,
  providerUsageDbHasRows,
  queryProviderUsageEventsForRawSpend,
} from "@/lib/cursor/provider-usage-db";
import {
  ensureSynced,
  getEventCount,
  getLastSyncAt,
  queryRawSpendRows,
  type RawSpendSort,
} from "@/lib/db/usage-db";
import {
  decodeProjectSlugForDisplay,
  projectNameFromSlug,
} from "@/lib/claude/project-slugs";
import {
  formatClaudeBillingCostLabel,
  formatApiEqCostLabel,
  formatDateTime,
  formatTokenCount,
  numericApiEqUsd,
  shortSessionId,
  shortComposerId,
  toRelativeTimeAgo,
} from "@/lib/format";
import { queryAllHarnessRawSpend } from "@/lib/raw-spend-all";
import { resolveActiveHarness } from "@/lib/profile/settings";
import {
  parseTimeframeFromSearchParams,
  timeframeToUnixBounds,
} from "@/lib/timeframe";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const harness = resolveActiveHarness();
  const url = new URL(request.url);
  const params = url.searchParams;
  const timeframe = parseTimeframeFromSearchParams(params);
  const bounds = timeframeToUnixBounds(timeframe);
  const sort = (params.get("sort") ?? "last_request") as RawSpendSort;
  const project = params.get("project")?.trim() || undefined;
  const model = params.get("model")?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (harness === "all") {
    const payload = await queryAllHarnessRawSpend({
      fromSec: bounds.fromSec,
      toSec: bounds.toSec,
      sort: sort === "highest_spend" ? "highest_spend" : "last_request",
      project,
      model,
      offset,
      limit: PAGE_SIZE,
    });

    return NextResponse.json({
      ...payload,
      page,
      pageSize: PAGE_SIZE,
    });
  }

  if (harness === "cursor") {
    const coverage = buildBillingCoveragePayload();
    const fromSec = bounds.fromSec ?? 0;
    const toSec = bounds.toSec ?? Math.floor(Date.now() / 1000);
    const { rows, total } = queryProviderUsageEventsForRawSpend({
      fromSec,
      toSec,
      project,
      model,
      sort: sort === "highest_spend" ? "highest_spend" : "last_request",
      offset,
      limit: PAGE_SIZE,
    });

    return NextResponse.json({
      harness: "cursor",
      rows: rows.map((row) => {
        const costs = formatCursorRowCostsSplit(row);
        const project = projectLabelsFromPath(row.project);
        return {
          id: row.id,
          harness: "cursor" as const,
          rowKey: `cursor-${row.id}`,
          createdAt: row.date,
          createdAtLabel: formatDateTime(row.date),
          createdAgo: toRelativeTimeAgo(row.date),
          sourceLabel: project.label,
          sourceDetail: project.detail,
          refLabel: shortComposerId(row.composerId || row.cloudAgentId || ""),
          model: row.model || "—",
          inputTokensLabel: formatTokenCount(row.inputWithoutCacheWrite ?? 0),
          cacheWriteLabel: formatTokenCount(row.inputWithCacheWrite ?? 0),
          cacheReadLabel: formatTokenCount(row.cacheRead ?? 0),
          outputTokensLabel: formatTokenCount(row.outputTokens ?? 0),
          totalTokensLabel: formatTokenCount(row.totalTokens ?? 0),
          billingCostLabel: costs.billingLabel,
          apiEqCostLabel: costs.apiEqLabel,
          calculatedCostUsd: numericApiEqUsdFromProviderRow(row),
        };
      }),
      page,
      pageSize: PAGE_SIZE,
      total,
      lastImportAt: getLastProviderImportAt(),
      eventCount: total,
      costSourceAvailable: providerUsageDbHasRows(),
      needsCsv: coverage.needsCsv,
      billingCoverage: coverage,
    });
  }

  await ensureSynced();

  const { rows, total } = queryRawSpendRows({
    fromSec: bounds.fromSec,
    toSec: bounds.toSec,
    projectSlug: project,
    model,
    sort: sort === "highest_spend" ? "highest_spend" : "last_request",
    offset,
    limit: PAGE_SIZE,
  });

  return NextResponse.json({
    harness: "claude",
    rows: rows.map((row) => ({
      id: row.id,
      harness: "claude" as const,
      rowKey: `claude-${row.id}`,
      createdAt: row.dateIso,
      createdAtLabel: formatDateTime(row.dateIso),
      createdAgo: toRelativeTimeAgo(row.dateIso),
      sourceLabel: projectNameFromSlug(row.projectSlug),
      sourceDetail: decodeProjectSlugForDisplay(row.projectSlug),
      refLabel: shortSessionId(row.sessionId),
      model: row.model,
      inputTokensLabel: formatTokenCount(row.inputWithoutCacheWrite),
      cacheWriteLabel: formatTokenCount(row.inputWithCacheWrite),
      cacheReadLabel: formatTokenCount(row.cacheRead),
      outputTokensLabel: formatTokenCount(row.outputTokens),
      totalTokensLabel: formatTokenCount(row.totalTokens),
      billingCostLabel: formatClaudeBillingCostLabel(row.costUsd),
      apiEqCostLabel: formatApiEqCostLabel(row.costUsd, row.calculatedCostUsd),
      calculatedCostUsd: numericApiEqUsd(row.costUsd, row.calculatedCostUsd),
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    lastSyncAt: getLastSyncAt(),
    eventCount: getEventCount(),
    costSourceAvailable: true,
    needsCsv: false,
  });
}
