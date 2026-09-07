import type { HarnessKind } from "@/lib/profile/settings";

export type ProjectBreakdownSort =
  | "recent_activity"
  | "most_plan_spend"
  | "most_api_eq";

export type ProjectSpendMonthLine = {
  month: string;
  monthLabel: string;
  harness: HarnessKind;
  projectApiEqLabel: string;
  totalApiEqLabel: string;
  planFeeLabel: string;
  spendUsd: number;
  spendLabel: string;
};

export type ProjectBreakdownHarnessRow = {
  harness: HarnessKind;
  harnessLabel: string;
  apiEqUsd: number;
  apiEqLabel: string;
  requestCount: number;
  requestRangeLabel: string;
  spendUsd: number;
  spendLabel: string;
  spendMonths: ProjectSpendMonthLine[];
};

export type ProjectBreakdownRow = {
  rowKey: string;
  harnesses: HarnessKind[];
  projectKey: string;
  label: string;
  detail: string | null;
  apiEqUsd: number;
  apiEqLabel: string;
  requestCount: number;
  requestRangeLabel: string;
  estimateCount: number;
  firstActivitySec: number;
  lastActivitySec: number;
  spendUsd: number;
  spendLabel: string;
  spendMonths: ProjectSpendMonthLine[];
  harnessBreakdown: ProjectBreakdownHarnessRow[];
};

export function filterProjectBreakdownRows(
  rows: ProjectBreakdownRow[],
  query: string,
): ProjectBreakdownRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;

  return rows.filter((row) => {
    const haystack = `${row.label} ${row.detail ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function sortProjectBreakdownRows(
  rows: ProjectBreakdownRow[],
  sort: ProjectBreakdownSort,
): ProjectBreakdownRow[] {
  const sorted = [...rows];

  if (sort === "recent_activity") {
    return sorted.sort(
      (a, b) =>
        b.lastActivitySec - a.lastActivitySec || a.label.localeCompare(b.label),
    );
  }

  if (sort === "most_plan_spend") {
    return sorted.sort(
      (a, b) => b.spendUsd - a.spendUsd || a.label.localeCompare(b.label),
    );
  }

  return sorted.sort(
    (a, b) => b.apiEqUsd - a.apiEqUsd || a.label.localeCompare(b.label),
  );
}

export function harnessLabel(harness: HarnessKind): string {
  return harness === "claude" ? "Claude Code" : "Cursor";
}
