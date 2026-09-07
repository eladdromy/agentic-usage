import type { HarnessKind } from "@/lib/profile/settings";

export type PlanLeverageHarnessRow = {
  harness: HarnessKind;
  harnessLabel: string;
  apiEqvUsd: number;
  apiEqvUsdLabel: string;
  planUsd: number;
  extraBilledUsd: number;
  effectivePlanUsd: number;
  planSpendLabel: string;
  leverage: number | null;
  leverageLabel: string;
  leveragePriorPct: number | null;
  planExposureUsd: number;
  planExposureLabel: string;
  dailySparkline: { date: string; apiEqvUsd: number }[];
  incompleteBilling?: boolean;
  /** No logs / subscription activity this month */
  inactive?: boolean;
  /** Months with activity (year summary breakdown) */
  monthCount?: number;
};

export type PlanLeverageMonthRow = {
  month: string;
  monthLabel: string;
  shortMonthLabel: string;
  apiEqvUsd: number;
  apiEqvUsdLabel: string;
  /** Subscription plan $/mo (base) */
  planUsd: number;
  /** On-demand / extra billed from CSV (Cursor) */
  extraBilledUsd: number;
  /** planUsd + extraBilledUsd — leverage denominator */
  effectivePlanUsd: number;
  effectivePlanUsdLabel: string;
  /** Total plan spend, e.g. "$24.50 ($20 + $4.50)" */
  planSpendLabel: string;
  leverage: number | null;
  leverageLabel: string;
  leveragePriorPct: number | null;
  planExposureUsd: number;
  planExposureLabel: string;
  dailySparkline: { date: string; apiEqvUsd: number }[];
  incompleteBilling?: boolean;
  harnessBreakdown: PlanLeverageHarnessRow[];
};

export type PlanLeverageYearPayload = {
  years: number[];
  selectedYear: number;
  showYearTabs: boolean;
  activeHarness: "claude" | "cursor" | "all";
  costSourceAvailable: boolean;
  needsCsv: boolean;
  plan: {
    label: string;
    monthlyUsd: number;
    source: string;
    monthlyUsdLabel: string;
  } | null;
  months: PlanLeverageMonthRow[];
  yearSummary: PlanLeverageYearSummary;
};

export type PlanLeverageYearSummary = {
  planSpendUsd: number;
  planSpendLabel: string;
  apiEqvUsd: number;
  apiEqvUsdLabel: string;
  leverage: number | null;
  leverageLabel: string;
  planExposureUsd: number;
  planExposureLabel: string;
  monthCount: number;
  planUsd: number;
  extraBilledUsd: number;
  planSpendShowBreakdown: boolean;
  harnessBreakdown: PlanLeverageHarnessRow[];
};
