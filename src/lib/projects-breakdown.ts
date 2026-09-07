import {
  decodeProjectSlugForDisplay,
  projectNameFromSlug,
} from "@/lib/claude/project-slugs";
import {
  queryProviderMonthlyApiEqBreakdown,
  queryProviderProjectBreakdown,
} from "@/lib/cursor/provider-usage-db";
import {
  queryClaudeHarnessMonthlyApiEqTotals,
  queryClaudeProjectBreakdown,
  queryClaudeProjectMonthlyApiEq,
} from "@/lib/db/usage-db";
import { formatProjectBreakdownUsd, formatProjectRequestRange } from "@/lib/format";
import {
  formatProjectPathLeaf,
  normalizeProjectPathKey,
} from "@/lib/format-project-path";
import {
  buildPlanSpendMonths,
  formatAllocatedSpendLabel,
  indexHarnessMonthlyTotals,
  indexProjectMonthlyApiEq,
  mergePlanSpendMonths,
} from "@/lib/projects-breakdown-spend";
import type {
  ProjectBreakdownHarnessRow,
  ProjectBreakdownRow,
} from "@/lib/projects-breakdown-shared";
import { harnessLabel } from "@/lib/projects-breakdown-shared";
import type { ActiveHarness, HarnessKind } from "@/lib/profile/settings";

export type {
  ProjectBreakdownHarnessRow,
  ProjectBreakdownRow,
} from "@/lib/projects-breakdown-shared";

/** Project-level API eq sums are always shown as estimates (~$). */
function formatProjectApiEqSum(usd: number): string {
  return formatProjectBreakdownUsd(usd, { approx: true });
}

function toHarnessRow(row: ProjectBreakdownRow): ProjectBreakdownHarnessRow {
  const harness = row.harnesses[0]!;
  return {
    harness,
    harnessLabel: harnessLabel(harness),
    apiEqUsd: row.apiEqUsd,
    apiEqLabel: row.apiEqLabel,
    requestCount: row.requestCount,
    requestRangeLabel: row.requestRangeLabel,
    spendUsd: row.spendUsd,
    spendLabel: row.spendLabel,
    spendMonths: row.spendMonths,
  };
}

function activityFields(firstActivitySec: number, lastActivitySec: number) {
  return {
    firstActivitySec,
    lastActivitySec,
    requestRangeLabel: formatProjectRequestRange(
      firstActivitySec,
      lastActivitySec,
    ),
  };
}

function claudeBreakdownRows(): ProjectBreakdownRow[] {
  const harnessMonthlyTotals = indexHarnessMonthlyTotals(
    queryClaudeHarnessMonthlyApiEqTotals(),
  );
  const projectMonthlyBySlug = indexProjectMonthlyApiEq(
    queryClaudeProjectMonthlyApiEq().map((row) => ({
      projectKey: row.projectSlug,
      month: row.month,
      apiEqUsd: row.apiEqUsd,
    })),
  );

  return queryClaudeProjectBreakdown().map((row) => {
    const detail = decodeProjectSlugForDisplay(row.projectSlug);
    const monthly =
      projectMonthlyBySlug.get(row.projectSlug) ?? new Map<string, number>();
    const spendMonths = buildPlanSpendMonths(
      monthly,
      harnessMonthlyTotals,
      "claude",
    );
    const spendUsd = spendMonths.reduce((sum, line) => sum + line.spendUsd, 0);

    return {
      rowKey: `claude-${row.projectSlug}`,
      harnesses: ["claude"],
      projectKey: row.projectSlug,
      label: projectNameFromSlug(row.projectSlug),
      detail,
      apiEqUsd: row.apiEqUsd,
      apiEqLabel: formatProjectApiEqSum(row.apiEqUsd),
      requestCount: row.requestCount,
      estimateCount: row.estimateCount,
      ...activityFields(row.firstActivitySec, row.lastActivitySec),
      spendUsd,
      spendLabel: formatAllocatedSpendLabel(spendUsd),
      spendMonths,
      harnessBreakdown: [],
    };
  });
}

function cursorBreakdownRows(): ProjectBreakdownRow[] {
  const { harnessTotalsByMonth, projectMonthlyByPath } =
    queryProviderMonthlyApiEqBreakdown();

  return queryProviderProjectBreakdown().map((row) => {
    const monthly =
      projectMonthlyByPath.get(row.projectPath) ?? new Map<string, number>();
    const spendMonths = buildPlanSpendMonths(
      monthly,
      harnessTotalsByMonth,
      "cursor",
    );
    const spendUsd = spendMonths.reduce((sum, line) => sum + line.spendUsd, 0);

    return {
      rowKey: `cursor-${row.projectPath}`,
      harnesses: ["cursor"],
      projectKey: row.projectPath,
      label: formatProjectPathLeaf(row.projectPath),
      detail: row.projectPath.replace(/\\/g, "/"),
      apiEqUsd: row.apiEqUsd,
      apiEqLabel: formatProjectApiEqSum(row.apiEqUsd),
      requestCount: row.requestCount,
      estimateCount: row.estimateCount,
      ...activityFields(row.firstActivitySec, row.lastActivitySec),
      spendUsd,
      spendLabel: formatAllocatedSpendLabel(spendUsd),
      spendMonths,
      harnessBreakdown: [],
    };
  });
}

type MergeBucket = {
  harnesses: Set<HarnessKind>;
  projectKey: string;
  label: string;
  detail: string;
  apiEqUsd: number;
  requestCount: number;
  estimateCount: number;
  firstActivitySec: number;
  lastActivitySec: number;
  spendUsd: number;
  harnessBreakdown: ProjectBreakdownHarnessRow[];
};

function mergeKeyForRow(row: ProjectBreakdownRow): string {
  const pathKey = normalizeProjectPathKey(row.detail);
  if (pathKey) return `path:${pathKey}`;
  return `${row.harnesses[0]}:${row.projectKey}`;
}

function mergeProjectBreakdownRows(
  rows: ProjectBreakdownRow[],
): ProjectBreakdownRow[] {
  const byKey = new Map<string, MergeBucket>();

  for (const row of rows) {
    const key = mergeKeyForRow(row);
    const detail = row.detail && row.detail !== "—" ? row.detail : row.label;
    const bucket = byKey.get(key) ?? {
      harnesses: new Set<HarnessKind>(),
      projectKey: detail,
      label: row.label,
      detail,
      apiEqUsd: 0,
      requestCount: 0,
      estimateCount: 0,
      firstActivitySec: 0,
      lastActivitySec: 0,
      spendUsd: 0,
      harnessBreakdown: [],
    };

    for (const harness of row.harnesses) {
      bucket.harnesses.add(harness);
    }
    bucket.apiEqUsd += row.apiEqUsd;
    bucket.requestCount += row.requestCount;
    bucket.estimateCount += row.estimateCount;
    if (row.firstActivitySec > 0) {
      bucket.firstActivitySec =
        bucket.firstActivitySec === 0
          ? row.firstActivitySec
          : Math.min(bucket.firstActivitySec, row.firstActivitySec);
    }
    bucket.lastActivitySec = Math.max(bucket.lastActivitySec, row.lastActivitySec);
    bucket.spendUsd += row.spendUsd;
    bucket.harnessBreakdown.push(toHarnessRow(row));

    if (row.detail && row.detail !== "—") {
      bucket.detail = row.detail;
      bucket.projectKey = row.detail;
      bucket.label = formatProjectPathLeaf(row.detail);
    }

    byKey.set(key, bucket);
  }

  return [...byKey.entries()]
    .map(([key, bucket]) => {
      const harnesses = [...bucket.harnesses].sort((a, b) =>
        a.localeCompare(b),
      ) as HarnessKind[];

      return {
        rowKey: key,
        harnesses,
        projectKey: bucket.projectKey,
        label: bucket.label,
        detail: bucket.detail,
        apiEqUsd: bucket.apiEqUsd,
        apiEqLabel: formatProjectApiEqSum(bucket.apiEqUsd),
        requestCount: bucket.requestCount,
        estimateCount: bucket.estimateCount,
        ...activityFields(bucket.firstActivitySec, bucket.lastActivitySec),
        spendUsd: bucket.spendUsd,
        spendLabel: formatAllocatedSpendLabel(bucket.spendUsd),
        spendMonths: mergePlanSpendMonths(
          bucket.harnessBreakdown.map((row) => row.spendMonths),
        ),
        harnessBreakdown:
          bucket.harnessBreakdown.length > 1
            ? bucket.harnessBreakdown.sort((a, b) =>
                a.harness.localeCompare(b.harness),
              )
            : [],
      };
    })
    .sort((a, b) => b.apiEqUsd - a.apiEqUsd || a.label.localeCompare(b.label));
}

export function queryProjectsBreakdown(
  harness: ActiveHarness,
): { harness: ActiveHarness; rows: ProjectBreakdownRow[]; totalApiEqUsd: number } {
  if (harness === "claude") {
    const rows = claudeBreakdownRows();
    return {
      harness,
      rows,
      totalApiEqUsd: rows.reduce((sum, row) => sum + row.apiEqUsd, 0),
    };
  }

  if (harness === "cursor") {
    const rows = cursorBreakdownRows();
    return {
      harness,
      rows,
      totalApiEqUsd: rows.reduce((sum, row) => sum + row.apiEqUsd, 0),
    };
  }

  const rows = mergeProjectBreakdownRows([
    ...claudeBreakdownRows(),
    ...cursorBreakdownRows(),
  ]);

  return {
    harness,
    rows,
    totalApiEqUsd: rows.reduce((sum, row) => sum + row.apiEqUsd, 0),
  };
}
