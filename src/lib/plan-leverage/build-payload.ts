import {
  queryAvailableYears,
  queryMonthlySpend,
  queryYearSpendByMonth,
} from "@/lib/db/usage-db";
import { buildBillingCoveragePayload } from "@/lib/cursor/billing-coverage";
import {
  providerUsageDbHasRows,
  queryMonthlyProviderSpend,
  queryProviderUsageAvailableYears,
  queryYearProviderSpendByMonth,
} from "@/lib/cursor/provider-usage-db";
import {
  formatPlanLeverageExposureLabel,
  formatPlanLeverageUsd,
  computePlanExposureUsd,
} from "@/lib/format";
import type {
  PlanLeverageHarnessRow,
  PlanLeverageMonthRow,
  PlanLeverageYearPayload,
  PlanLeverageYearSummary,
} from "@/lib/plan-leverage/types";
import {
  computeLeverage,
  formatLeverageMultiplier,
  resolveActiveHarness,
  resolvePlanConfig,
} from "@/lib/profile/settings";
import type { HarnessKind } from "@/lib/profile/settings";
import { priorMonthParam } from "@/lib/timeframe";

type MonthSpend = {
  totalApiEqvUsd: number;
  extraBilledUsd: number;
  dailySparkline: { date: string; apiEqvUsd: number }[];
};

function monthLabel(month: string, style: "long" | "short"): string {
  const d = new Date(`${month}-01T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    month: style === "long" ? "long" : "short",
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

function formatEffectivePlanUsdLabel(
  planUsd: number,
  extraBilledUsd: number,
): string {
  const planPart = formatPlanLeverageUsd(planUsd);
  if (extraBilledUsd <= 0) return `${planPart} plan`;
  return `${planPart} plan + ${formatPlanLeverageUsd(extraBilledUsd)} extra`;
}

export function formatPlanSpendLabel(
  planUsd: number,
  extraBilledUsd: number,
): string {
  const total = planUsd + extraBilledUsd;
  if (extraBilledUsd <= 0) return formatPlanLeverageUsd(total);
  return `${formatPlanLeverageUsd(total)} (${formatPlanLeverageUsd(planUsd)} + ${formatPlanLeverageUsd(extraBilledUsd)})`;
}

function formatPlanSpendTotalLabel(
  planUsd: number,
  extraBilledUsd: number,
): string {
  return formatPlanLeverageUsd(planUsd + extraBilledUsd);
}

function mergeSparklines(
  a: { date: string; apiEqvUsd: number }[],
  b: { date: string; apiEqvUsd: number }[],
): { date: string; apiEqvUsd: number }[] {
  const byDay = new Map<string, number>();
  for (const point of [...a, ...b]) {
    byDay.set(point.date, (byDay.get(point.date) ?? 0) + point.apiEqvUsd);
  }
  return [...byDay.entries()]
    .sort(([d1], [d2]) => d1.localeCompare(d2))
    .map(([date, apiEqvUsd]) => ({ date, apiEqvUsd }));
}

function computeLeveragePriorPct(
  leverage: number | null,
  priorLeverage: number | null,
): number | null {
  if (leverage == null || priorLeverage == null || priorLeverage <= 0) {
    return null;
  }
  return ((leverage - priorLeverage) / priorLeverage) * 100;
}

function buildEmptyHarnessRow(harness: HarnessKind): PlanLeverageHarnessRow {
  return {
    harness,
    harnessLabel: harness === "claude" ? "Claude Code" : "Cursor",
    apiEqvUsd: 0,
    apiEqvUsdLabel: "—",
    planUsd: 0,
    extraBilledUsd: 0,
    effectivePlanUsd: 0,
    planSpendLabel: "—",
    leverage: null,
    leverageLabel: "—",
    leveragePriorPct: null,
    planExposureUsd: 0,
    planExposureLabel: "—",
    dailySparkline: [],
    inactive: true,
  };
}

function buildHarnessRow(
  harness: HarnessKind,
  month: string,
  spend: MonthSpend,
  planUsd: number,
  priorSpend: MonthSpend,
  incompleteBilling = false,
): PlanLeverageHarnessRow {
  const effectivePlanUsd = planUsd + spend.extraBilledUsd;
  const priorEffectivePlanUsd = planUsd + priorSpend.extraBilledUsd;
  const leverage =
    effectivePlanUsd > 0
      ? computeLeverage(spend.totalApiEqvUsd, effectivePlanUsd)
      : null;
  const priorLeverage =
    priorEffectivePlanUsd > 0
      ? computeLeverage(priorSpend.totalApiEqvUsd, priorEffectivePlanUsd)
      : null;

  return {
    harness,
    harnessLabel: harness === "claude" ? "Claude Code" : "Cursor",
    apiEqvUsd: spend.totalApiEqvUsd,
    apiEqvUsdLabel: formatPlanLeverageUsd(spend.totalApiEqvUsd),
    planUsd,
    extraBilledUsd: spend.extraBilledUsd,
    effectivePlanUsd,
    planSpendLabel: formatPlanSpendLabel(planUsd, spend.extraBilledUsd),
    leverage,
    leverageLabel: leverage != null ? formatLeverageMultiplier(leverage) : "—",
    leveragePriorPct: computeLeveragePriorPct(leverage, priorLeverage),
    planExposureUsd: computePlanExposureUsd(spend.totalApiEqvUsd, effectivePlanUsd),
    planExposureLabel: formatPlanLeverageExposureLabel(
      spend.totalApiEqvUsd,
      effectivePlanUsd,
    ),
    dailySparkline: spend.dailySparkline,
    incompleteBilling,
  };
}

function buildMonthRow(
  month: string,
  totalApiEqvUsd: number,
  dailySparkline: { date: string; apiEqvUsd: number }[],
  planUsd: number,
  extraBilledUsd: number,
  priorApiEqvUsd: number,
  priorExtraBilledUsd: number,
  harnessBreakdown: PlanLeverageHarnessRow[],
  incompleteBilling = false,
): PlanLeverageMonthRow {
  const effectivePlanUsd = planUsd + extraBilledUsd;
  const priorEffectivePlanUsd = planUsd + priorExtraBilledUsd;
  const leverage =
    effectivePlanUsd > 0
      ? computeLeverage(totalApiEqvUsd, effectivePlanUsd)
      : null;
  const priorLeverage =
    priorEffectivePlanUsd > 0
      ? computeLeverage(priorApiEqvUsd, priorEffectivePlanUsd)
      : null;

  return {
    month,
    monthLabel: monthLabel(month, "long"),
    shortMonthLabel: monthLabel(month, "short"),
    apiEqvUsd: totalApiEqvUsd,
    apiEqvUsdLabel: formatPlanLeverageUsd(totalApiEqvUsd),
    planUsd,
    extraBilledUsd,
    effectivePlanUsd,
    effectivePlanUsdLabel: formatEffectivePlanUsdLabel(planUsd, extraBilledUsd),
    planSpendLabel:
      harnessBreakdown.length > 1
        ? formatPlanSpendTotalLabel(planUsd, extraBilledUsd)
        : formatPlanSpendLabel(planUsd, extraBilledUsd),
    leverage,
    leverageLabel: leverage != null ? formatLeverageMultiplier(leverage) : "—",
    leveragePriorPct: computeLeveragePriorPct(leverage, priorLeverage),
    planExposureUsd: computePlanExposureUsd(totalApiEqvUsd, effectivePlanUsd),
    planExposureLabel: formatPlanLeverageExposureLabel(totalApiEqvUsd, effectivePlanUsd),
    dailySparkline,
    incompleteBilling,
    harnessBreakdown,
  };
}

function emptyMonthSpend(): MonthSpend {
  return { totalApiEqvUsd: 0, extraBilledUsd: 0, dailySparkline: [] };
}

function monthSpendFromYearRow(
  rows: ({ month: string } & MonthSpend)[],
  month: string,
): MonthSpend {
  const row = rows.find((r) => r.month === month);
  return row ?? emptyMonthSpend();
}

function buildYearHarnessSummary(
  harness: HarnessKind,
  months: PlanLeverageMonthRow[],
): PlanLeverageHarnessRow {
  let planUsd = 0;
  let extraBilledUsd = 0;
  let apiEqvUsd = 0;
  let monthCount = 0;

  for (const month of months) {
    const row = month.harnessBreakdown.find((h) => h.harness === harness);
    if (!row || row.inactive) continue;
    monthCount++;
    planUsd += row.planUsd;
    extraBilledUsd += row.extraBilledUsd;
    apiEqvUsd += row.apiEqvUsd;
  }

  if (monthCount === 0) {
    return buildEmptyHarnessRow(harness);
  }

  const effectivePlanUsd = planUsd + extraBilledUsd;
  const leverage =
    effectivePlanUsd > 0 ? computeLeverage(apiEqvUsd, effectivePlanUsd) : null;

  return {
    harness,
    harnessLabel: harness === "claude" ? "Claude Code" : "Cursor",
    apiEqvUsd,
    apiEqvUsdLabel: formatPlanLeverageUsd(apiEqvUsd),
    planUsd,
    extraBilledUsd,
    effectivePlanUsd,
    planSpendLabel: formatPlanSpendLabel(planUsd, extraBilledUsd),
    leverage,
    leverageLabel: leverage != null ? formatLeverageMultiplier(leverage) : "—",
    leveragePriorPct: null,
    planExposureUsd: computePlanExposureUsd(apiEqvUsd, effectivePlanUsd),
    planExposureLabel: formatPlanLeverageExposureLabel(apiEqvUsd, effectivePlanUsd),
    dailySparkline: [],
    monthCount,
  };
}

function buildYearSummary(
  months: PlanLeverageMonthRow[],
  activeHarness: PlanLeverageYearPayload["activeHarness"],
): PlanLeverageYearSummary {
  const planUsd = months.reduce((sum, m) => sum + m.planUsd, 0);
  const extraBilledUsd = months.reduce((sum, m) => sum + m.extraBilledUsd, 0);
  const apiEqvUsd = months.reduce((sum, m) => sum + m.apiEqvUsd, 0);
  const effectivePlanUsd = planUsd + extraBilledUsd;
  const leverage =
    effectivePlanUsd > 0 ? computeLeverage(apiEqvUsd, effectivePlanUsd) : null;

  const planSpendLabel =
    activeHarness === "all" || extraBilledUsd <= 0
      ? formatPlanSpendTotalLabel(planUsd, extraBilledUsd)
      : formatPlanSpendLabel(planUsd, extraBilledUsd);

  return {
    planSpendUsd: effectivePlanUsd,
    planSpendLabel,
    apiEqvUsd,
    apiEqvUsdLabel: formatPlanLeverageUsd(apiEqvUsd),
    leverage,
    leverageLabel: leverage != null ? formatLeverageMultiplier(leverage) : "—",
    planExposureUsd: computePlanExposureUsd(apiEqvUsd, effectivePlanUsd),
    planExposureLabel: formatPlanLeverageExposureLabel(apiEqvUsd, effectivePlanUsd),
    monthCount: months.length,
    planUsd,
    extraBilledUsd,
    planSpendShowBreakdown: activeHarness !== "all" && extraBilledUsd > 0,
    harnessBreakdown:
      activeHarness === "all"
        ? (["claude", "cursor"] as const)
            .map((h) => buildYearHarnessSummary(h, months))
            .filter((row) => (row.monthCount ?? 0) > 0)
        : [],
  };
}

function buildClaudeYearPayload(selectedYear: number): PlanLeverageYearPayload {
  const years = queryAvailableYears();
  const year =
    years.includes(selectedYear) ? selectedYear : (years[0] ?? new Date().getUTCFullYear());
  const plan = resolvePlanConfig("claude");
  const planUsd = plan?.monthlyUsd ?? 0;

  const yearMonths = queryYearSpendByMonth(year);
  const months: PlanLeverageMonthRow[] = yearMonths.map((row) => {
    const prior = queryMonthlySpend(priorMonthParam(row.month));
    const monthPlan = resolvePlanConfig("claude", row.month);
    const monthPlanUsd = monthPlan?.monthlyUsd ?? planUsd;
    const harnessRow = buildHarnessRow(
      "claude",
      row.month,
      row,
      monthPlanUsd,
      prior,
    );
    return buildMonthRow(
      row.month,
      row.totalApiEqvUsd,
      row.dailySparkline,
      monthPlanUsd,
      row.extraBilledUsd,
      prior.totalApiEqvUsd,
      prior.extraBilledUsd,
      [harnessRow],
    );
  });

  return {
    years,
    selectedYear: year,
    showYearTabs: years.length > 1,
    activeHarness: "claude",
    costSourceAvailable: true,
    needsCsv: false,
    plan: plan
      ? {
          label: plan.label,
          monthlyUsd: plan.monthlyUsd,
          source: plan.source,
          monthlyUsdLabel: formatPlanLeverageUsd(plan.monthlyUsd),
        }
      : null,
    months,
    yearSummary: buildYearSummary(months, "claude"),
  };
}

function buildCursorYearPayload(selectedYear: number): PlanLeverageYearPayload {
  const coverage = buildBillingCoveragePayload();
  const years = queryProviderUsageAvailableYears();
  const year =
    years.includes(selectedYear) ? selectedYear : (years[0] ?? new Date().getUTCFullYear());
  const plan = resolvePlanConfig("cursor");
  const planUsd = plan?.monthlyUsd ?? 0;

  const yearMonths = queryYearProviderSpendByMonth(year);
  const months: PlanLeverageMonthRow[] = yearMonths.map((row) => {
    const prior = queryMonthlyProviderSpend(priorMonthParam(row.month));
    const monthPlan = resolvePlanConfig("cursor", row.month);
    const monthPlanUsd = monthPlan?.monthlyUsd ?? planUsd;
    const harnessRow = buildHarnessRow(
      "cursor",
      row.month,
      row,
      monthPlanUsd,
      prior,
    );
    return buildMonthRow(
      row.month,
      row.totalApiEqvUsd,
      row.dailySparkline,
      monthPlanUsd,
      row.extraBilledUsd,
      prior.totalApiEqvUsd,
      prior.extraBilledUsd,
      [harnessRow],
    );
  });

  return {
    years,
    selectedYear: year,
    showYearTabs: years.length > 1,
    activeHarness: "cursor",
    costSourceAvailable: providerUsageDbHasRows(),
    needsCsv: coverage.needsCsv,
    plan: plan
      ? {
          label: plan.label,
          monthlyUsd: plan.monthlyUsd,
          source: plan.source,
          monthlyUsdLabel: formatPlanLeverageUsd(plan.monthlyUsd),
        }
      : null,
    months,
    yearSummary: buildYearSummary(months, "cursor"),
  };
}

function buildAllYearPayload(selectedYear: number): PlanLeverageYearPayload {
  const coverage = buildBillingCoveragePayload();
  const claudeYears = queryAvailableYears();
  const cursorYears = queryProviderUsageAvailableYears();
  const years = [...new Set([...claudeYears, ...cursorYears])].sort(
    (a, b) => b - a,
  );
  const year =
    years.includes(selectedYear) ? selectedYear : (years[0] ?? new Date().getUTCFullYear());

  const claudePlan = resolvePlanConfig("claude");
  const cursorPlan = resolvePlanConfig("cursor");
  const claudePlanUsd = claudePlan?.monthlyUsd ?? 0;
  const cursorPlanUsd = cursorPlan?.monthlyUsd ?? 0;

  const claudeMonths = queryYearSpendByMonth(year);
  const cursorMonths = queryYearProviderSpendByMonth(year);
  const monthKeys = [
    ...new Set([
      ...claudeMonths
        .filter((r) => r.totalApiEqvUsd > 0)
        .map((r) => r.month),
      ...cursorMonths
        .filter((r) => r.totalApiEqvUsd > 0)
        .map((r) => r.month),
    ]),
  ].sort((a, b) => b.localeCompare(a));

  const months: PlanLeverageMonthRow[] = monthKeys.map((month) => {
    const claudeSpend = monthSpendFromYearRow(claudeMonths, month);
    const cursorSpend = monthSpendFromYearRow(cursorMonths, month);
    const priorClaude = queryMonthlySpend(priorMonthParam(month));
    const priorCursor = queryMonthlyProviderSpend(priorMonthParam(month));

    const harnessBreakdown: PlanLeverageHarnessRow[] = [];
    if (claudeSpend.totalApiEqvUsd > 0) {
      const claudeMonthPlan = resolvePlanConfig("claude", month);
      const claudeMonthPlanUsd = claudeMonthPlan?.monthlyUsd ?? claudePlanUsd;
      harnessBreakdown.push(
        buildHarnessRow(
          "claude",
          month,
          claudeSpend,
          claudeMonthPlanUsd,
          priorClaude,
        ),
      );
    }
    if (cursorSpend.totalApiEqvUsd > 0) {
      const cursorMonthPlan = resolvePlanConfig("cursor", month);
      const cursorMonthPlanUsd = cursorMonthPlan?.monthlyUsd ?? cursorPlanUsd;
      harnessBreakdown.push(
        buildHarnessRow(
          "cursor",
          month,
          cursorSpend,
          cursorMonthPlanUsd,
          priorCursor,
        ),
      );
    }

    const totalApiEqvUsd =
      claudeSpend.totalApiEqvUsd + cursorSpend.totalApiEqvUsd;
    const planUsd = harnessBreakdown.reduce((sum, row) => sum + row.planUsd, 0);
    const extraBilledUsd =
      claudeSpend.extraBilledUsd + cursorSpend.extraBilledUsd;
    const priorApiEqvUsd =
      (claudeSpend.totalApiEqvUsd > 0 ? priorClaude.totalApiEqvUsd : 0) +
      (cursorSpend.totalApiEqvUsd > 0 ? priorCursor.totalApiEqvUsd : 0);
    const priorExtraBilledUsd =
      (claudeSpend.totalApiEqvUsd > 0 ? priorClaude.extraBilledUsd : 0) +
      (cursorSpend.totalApiEqvUsd > 0 ? priorCursor.extraBilledUsd : 0);

    return buildMonthRow(
      month,
      totalApiEqvUsd,
      mergeSparklines(claudeSpend.dailySparkline, cursorSpend.dailySparkline),
      planUsd,
      extraBilledUsd,
      priorApiEqvUsd,
      priorExtraBilledUsd,
      harnessBreakdown,
    );
  });

  const planLabel =
    claudePlan && cursorPlan
      ? `${claudePlan.label} + ${cursorPlan.label}`
      : claudePlan?.label ?? cursorPlan?.label ?? "Combined";

  return {
    years,
    selectedYear: year,
    showYearTabs: years.length > 1,
    activeHarness: "all",
    costSourceAvailable: true,
    needsCsv: coverage.needsCsv,
    plan:
      claudePlanUsd + cursorPlanUsd > 0 || claudePlan || cursorPlan
        ? {
            label: planLabel,
            monthlyUsd: claudePlanUsd + cursorPlanUsd,
            source:
              claudePlan?.source === "manual" || cursorPlan?.source === "manual"
                ? "manual"
                : "auto",
            monthlyUsdLabel: formatPlanLeverageUsd(claudePlanUsd + cursorPlanUsd),
          }
        : null,
    months,
    yearSummary: buildYearSummary(months, "all"),
  };
}

export function buildPlanLeverageYearPayload(
  selectedYear: number,
): PlanLeverageYearPayload {
  const harness = resolveActiveHarness();
  if (harness === "all") {
    return buildAllYearPayload(selectedYear);
  }
  if (harness === "cursor") {
    return buildCursorYearPayload(selectedYear);
  }
  return buildClaudeYearPayload(selectedYear);
}

/** @deprecated Single-month helper kept for compatibility */
export function buildPlanLeverageMonthPayload(month: string) {
  const harness = resolveActiveHarness();
  const plan = resolvePlanConfig(harness === "all" ? undefined : harness);
  const planUsd = plan?.monthlyUsd ?? 0;

  if (harness === "cursor") {
    const current = queryMonthlyProviderSpend(month);
    const prior = queryMonthlyProviderSpend(priorMonthParam(month));
    const monthPlan = resolvePlanConfig("cursor", month);
    const monthPlanUsd = monthPlan?.monthlyUsd ?? planUsd;
    const row = buildMonthRow(
      month,
      current.totalApiEqvUsd,
      current.dailySparkline,
      monthPlanUsd,
      current.extraBilledUsd,
      prior.totalApiEqvUsd,
      prior.extraBilledUsd,
      [
        buildHarnessRow("cursor", month, current, monthPlanUsd, prior),
      ],
    );
    return {
      month,
      monthLabel: row.monthLabel,
      plan: plan
        ? {
            label: plan.label,
            monthlyUsd: plan.monthlyUsd,
            source: plan.source,
            monthlyUsdLabel: formatPlanLeverageUsd(plan.monthlyUsd),
          }
        : null,
      apiEqvUsd: row.apiEqvUsd,
      apiEqvUsdLabel: row.apiEqvUsdLabel,
      leverage: row.leverage,
      leverageLabel: row.leverageLabel,
      leveragePriorPct: row.leveragePriorPct ?? 0,
      dailySparkline: row.dailySparkline,
      windowStart: `${month}-01`,
      windowEnd: month,
    };
  }

  const current = queryMonthlySpend(month);
  const prior = queryMonthlySpend(priorMonthParam(month));
  const monthPlan = resolvePlanConfig("claude", month);
  const monthPlanUsd = monthPlan?.monthlyUsd ?? planUsd;
  const row = buildMonthRow(
    month,
    current.totalApiEqvUsd,
    current.dailySparkline,
    monthPlanUsd,
    current.extraBilledUsd,
    prior.totalApiEqvUsd,
    prior.extraBilledUsd,
    [
      buildHarnessRow("claude", month, current, monthPlanUsd, prior),
    ],
  );

  return {
    month,
    monthLabel: row.monthLabel,
    plan: plan
      ? {
          label: plan.label,
          monthlyUsd: plan.monthlyUsd,
          source: plan.source,
          monthlyUsdLabel: formatPlanLeverageUsd(plan.monthlyUsd),
        }
      : null,
    apiEqvUsd: row.apiEqvUsd,
    apiEqvUsdLabel: row.apiEqvUsdLabel,
    leverage: row.leverage,
    leverageLabel: row.leverageLabel,
    leveragePriorPct: row.leveragePriorPct ?? 0,
    dailySparkline: row.dailySparkline,
    windowStart: current.planWindowStart,
    windowEnd: current.planWindowEnd,
  };
}
