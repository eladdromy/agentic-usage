import { formatProjectBreakdownUsd, formatYearMonthLabel } from "@/lib/format";
import type { ProjectSpendMonthLine } from "@/lib/projects-breakdown-shared";
import type { HarnessKind } from "@/lib/profile/settings";
import { resolvePlanConfig } from "@/lib/profile/settings";

export type { ProjectSpendMonthLine };

export function indexHarnessMonthlyTotals(
  rows: { month: string; apiEqUsd: number }[],
): Map<string, number> {
  return new Map(rows.map((row) => [row.month, row.apiEqUsd]));
}

export function indexProjectMonthlyApiEq(
  rows: { projectKey: string; month: string; apiEqUsd: number }[],
): Map<string, Map<string, number>> {
  const byProject = new Map<string, Map<string, number>>();

  for (const row of rows) {
    let byMonth = byProject.get(row.projectKey);
    if (!byMonth) {
      byMonth = new Map<string, number>();
      byProject.set(row.projectKey, byMonth);
    }
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.apiEqUsd);
  }

  return byProject;
}

/** Subscription spend allocated by each project's share of monthly API eq. */
export function buildPlanSpendMonths(
  projectMonthlyApiEq: Map<string, number>,
  harnessMonthlyTotals: Map<string, number>,
  harness: HarnessKind,
): ProjectSpendMonthLine[] {
  const lines: ProjectSpendMonthLine[] = [];

  for (const [month, projectApiEq] of projectMonthlyApiEq) {
    if (projectApiEq <= 0) continue;

    const monthTotal = harnessMonthlyTotals.get(month) ?? 0;
    if (monthTotal <= 0) continue;

    const planUsd = resolvePlanConfig(harness, month)?.monthlyUsd ?? 0;
    if (planUsd <= 0) continue;

    const spendUsd = (projectApiEq / monthTotal) * planUsd;
    lines.push({
      month,
      monthLabel: formatYearMonthLabel(month),
      harness,
      projectApiEqLabel: formatProjectBreakdownUsd(projectApiEq, { approx: true }),
      totalApiEqLabel: formatProjectBreakdownUsd(monthTotal, { approx: true }),
      planFeeLabel: formatProjectBreakdownUsd(planUsd),
      spendUsd,
      spendLabel: formatAllocatedSpendLabel(spendUsd),
    });
  }

  return lines.sort((a, b) => b.month.localeCompare(a.month));
}

export function mergePlanSpendMonths(
  groups: ProjectSpendMonthLine[][],
): ProjectSpendMonthLine[] {
  return groups
    .flat()
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) || a.harness.localeCompare(b.harness),
    );
}

/** Subscription spend allocated by each project's share of monthly API eq. */
export function allocatePlanSpendUsd(
  projectMonthlyApiEq: Map<string, number>,
  harnessMonthlyTotals: Map<string, number>,
  harness: HarnessKind,
): number {
  return buildPlanSpendMonths(
    projectMonthlyApiEq,
    harnessMonthlyTotals,
    harness,
  ).reduce((sum, line) => sum + line.spendUsd, 0);
}

export function formatAllocatedSpendLabel(spendUsd: number): string {
  return formatProjectBreakdownUsd(spendUsd);
}
