import { NextResponse } from "next/server";

import { queryYearSpendByMonth, queryAvailableYears } from "@/lib/db/usage-db";
import {
  detectClaudePlanFromProfile,
  readClaudeProfile,
  readSettings,
  resolvePlanConfig,
  type HarnessKind,
} from "@/lib/profile/settings";
import { detectCursorPlanFromProfile } from "@/lib/cursor/cursor-profile";
import { getResolvedVscdbPath } from "@/lib/cursor/path";
import {
  formatPlanTierOptionLabel,
  planTiersForHarness,
} from "@/lib/profile/plan-tiers";
import {
  queryProviderUsageAvailableYears,
  queryYearProviderSpendByMonth,
} from "@/lib/cursor/provider-usage-db";
import { readCursorProfile } from "@/lib/cursor/cursor-profile";

export const runtime = "nodejs";

function monthsWithActivity(
  harness: HarnessKind,
  year: number,
): string[] {
  const rows =
    harness === "cursor"
      ? queryYearProviderSpendByMonth(year)
      : queryYearSpendByMonth(year);
  return rows
    .filter((row) => row.totalApiEqvUsd > 0)
    .map((row) => row.month)
    .sort((a, b) => b.localeCompare(a));
}

function availableYearsForHarness(harness: HarnessKind): number[] {
  return harness === "cursor"
    ? queryProviderUsageAvailableYears()
    : queryAvailableYears();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const harnessParam = url.searchParams.get("harness");
  const harness: HarnessKind =
    harnessParam === "cursor" ? "cursor" : "claude";

  const yearParam = url.searchParams.get("year");
  const years = availableYearsForHarness(harness);
  const fallbackYear = years[0] ?? new Date().getUTCFullYear();
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : fallbackYear;
  const year = years.includes(parsedYear) ? parsedYear : fallbackYear;

  const settings = readSettings();
  const activityMonths = monthsWithActivity(harness, year);
  const overrideMonths = Object.keys(settings.planOverrides[harness] ?? {});
  const months = [...new Set([...activityMonths, ...overrideMonths])]
    .filter((month) => month.startsWith(`${year}-`))
    .sort((a, b) => b.localeCompare(a));

  const detectedPlan =
    harness === "cursor"
      ? detectCursorPlanFromProfile(
          readCursorProfile(getResolvedVscdbPath(settings.vscdbPathOverride)),
        )
      : detectClaudePlanFromProfile(readClaudeProfile());

  const resolvedByMonth = Object.fromEntries(
    months.map((month) => [month, resolvePlanConfig(harness, month)]),
  );

  return NextResponse.json({
    harness,
    years,
    year,
    months,
    detectedPlan,
    overrides: settings.planOverrides[harness] ?? {},
    resolvedByMonth,
    tiers: planTiersForHarness(harness).map((tier) => ({
      ...tier,
      optionLabel: formatPlanTierOptionLabel(tier),
    })),
  });
}
