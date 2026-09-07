import type { ProviderUsageParsedRow } from "@/lib/cursor/provider-usage-types";
import { formatApiEqCostLabel, numericApiEqUsd } from "@/lib/format";
import {
  isCacheWriteBucketApplicable,
  resolveModelRate,
} from "@/lib/pricing/model-pricing";
import { costFromTokenBuckets } from "@/lib/pricing/usage-cost";
import type {
  CostEstimate,
  FormattedUsageCost,
  NormalizedTokenUsage,
  ParsedBillingCost,
  TokenBuckets,
  UsageCostLineItem,
  UsageCostMode,
} from "@/lib/pricing/usage-cost-types";

export function formatUsd(
  value: number,
  opts?: { approx?: boolean },
): string {
  const prefix = opts?.approx ? "~$" : "$";
  if (value >= 100) return `${prefix}${value.toFixed(0)}`;
  if (value >= 10) return `${prefix}${value.toFixed(1)}`;
  if (value >= 1) return `${prefix}${value.toFixed(2)}`;
  return `${prefix}${value.toFixed(3)}`;
}

export function parseBillingCost(cost: string | null | undefined): ParsedBillingCost {
  const trimmed = cost?.trim() ?? "";
  if (!trimmed) return { kind: "empty", value: null };

  const numeric = trimmed.replace(/^\$/, "").replace(/,/g, "");
  const asNum = Number.parseFloat(numeric);
  if (Number.isFinite(asNum) && /^[\d$.,]+$/.test(trimmed.replace(/\s/g, ""))) {
    return { kind: "usd", value: asNum };
  }

  return { kind: "label", value: trimmed };
}

function tokensFromCursorRow(row: ProviderUsageParsedRow): NormalizedTokenUsage {
  return {
    inputWithoutCacheWrite: row.inputWithoutCacheWrite ?? 0,
    inputWithCacheWrite: row.inputWithCacheWrite ?? 0,
    cacheRead: row.cacheRead ?? 0,
    outputTokens: row.outputTokens ?? 0,
  };
}

function tokensFromNormalizedUsage(
  usage: NormalizedTokenUsage,
  model: string,
): TokenBuckets {
  const cacheWrite = usage.inputWithCacheWrite;
  if (isCacheWriteBucketApplicable(model)) {
    return {
      input: usage.inputWithoutCacheWrite,
      output: usage.outputTokens,
      cacheCreate5m: cacheWrite,
      cacheCreate1h: 0,
      cacheRead: usage.cacheRead,
    };
  }
  return {
    input: usage.inputWithoutCacheWrite + cacheWrite,
    output: usage.outputTokens,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheRead: usage.cacheRead,
  };
}

export function estimateCursorRowCost(row: ProviderUsageParsedRow): CostEstimate {
  const model = row.model;
  const usage = tokensFromNormalizedUsage(tokensFromCursorRow(row), model);
  return costFromTokenBuckets(usage, model);
}

function billingLabelFromParsed(parsed: ParsedBillingCost): string | null {
  if (parsed.kind === "empty") return null;
  if (parsed.kind === "usd") return formatUsd(parsed.value as number);
  return parsed.value as string;
}

export function formatUsageCost(input: {
  billingCost: string | null | undefined;
  estimate: CostEstimate | null;
  mode: UsageCostMode;
  assumeIncludedWhenEmpty?: boolean;
}): FormattedUsageCost {
  const parsed = parseBillingCost(input.billingCost);
  const billingLabel = billingLabelFromParsed(parsed);
  const estimatedUsd = input.estimate?.usd ?? null;
  const approx =
    estimatedUsd != null ? formatUsd(estimatedUsd, { approx: true }) : null;

  const { mode } = input;

  if (mode === "display") {
    if (billingLabel) {
      return { billingLabel, estimatedUsd, display: billingLabel };
    }
    if (input.assumeIncludedWhenEmpty) {
      return { billingLabel: "Included", estimatedUsd, display: "Included" };
    }
    return { billingLabel: null, estimatedUsd, display: "—" };
  }

  if (mode === "calculate") {
    return { billingLabel, estimatedUsd, display: approx ?? "—" };
  }

  if (mode === "auto") {
    if (parsed.kind === "usd") {
      return {
        billingLabel,
        estimatedUsd,
        display: billingLabel ?? "—",
      };
    }
    return {
      billingLabel,
      estimatedUsd,
      display: approx ?? billingLabel ?? "—",
    };
  }

  const label =
    billingLabel ??
    (input.assumeIncludedWhenEmpty ? "Included" : null);

  if (label && approx) {
    return {
      billingLabel: label,
      estimatedUsd,
      display: `${label} (${approx})`,
    };
  }
  if (label) {
    return { billingLabel: label, estimatedUsd, display: label };
  }
  if (approx) {
    return { billingLabel: null, estimatedUsd, display: approx };
  }
  return { billingLabel: null, estimatedUsd: null, display: "—" };
}

export function formatCursorRowCost(
  row: ProviderUsageParsedRow,
  mode: UsageCostMode = "both",
): FormattedUsageCost {
  const estimate = estimateCursorRowCost(row);
  return formatUsageCost({
    billingCost: row.cost,
    estimate,
    mode,
    assumeIncludedWhenEmpty: false,
  });
}

/** Billing column (Included / $) separate from API-equivalent cost. */
export function formatCursorRowCostsSplit(row: ProviderUsageParsedRow): {
  billingLabel: string;
  apiEqLabel: string;
} {
  const estimate = estimateCursorRowCost(row);
  const billing = formatUsageCost({
    billingCost: row.cost,
    estimate: null,
    mode: "display",
    assumeIncludedWhenEmpty: true,
  });
  const billed = numericBilledUsdFromProviderRow(row);
  return {
    billingLabel: billing.display,
    apiEqLabel: formatApiEqCostLabel(billed, estimate.usd),
  };
}

export function numericBilledUsdFromProviderRow(
  row: ProviderUsageParsedRow,
): number {
  const parsed = parseBillingCost(row.cost);
  if (parsed.kind === "usd" && typeof parsed.value === "number") {
    return parsed.value;
  }
  return 0;
}

export function numericApiEqUsdFromProviderRow(
  row: ProviderUsageParsedRow,
): number {
  const billed = numericBilledUsdFromProviderRow(row);
  const estimate = estimateCursorRowCost(row);
  return numericApiEqUsd(billed, estimate.usd);
}

export function numericUsdFromFormattedCost(
  cost: FormattedUsageCost | null | undefined,
): number {
  if (!cost || cost.display === "—") return 0;
  const parsed = parseBillingCost(cost.billingLabel);
  if (parsed.kind === "usd" && typeof parsed.value === "number") {
    return parsed.value;
  }
  if (cost.estimatedUsd != null && Number.isFinite(cost.estimatedUsd)) {
    return cost.estimatedUsd;
  }
  return 0;
}

function isIncludedBillingLabel(label: string): boolean {
  return label.trim().toLowerCase() === "included";
}

export function aggregateUsageCosts(
  items: readonly UsageCostLineItem[],
  mode: UsageCostMode = "both",
): FormattedUsageCost {
  if (items.length === 0) {
    return { billingLabel: null, estimatedUsd: null, display: "—" };
  }

  let billingUsdSum = 0;
  let hasBillingUsd = false;
  let includedCount = 0;
  let estimatedSum = 0;
  let hasEstimate = false;
  let anyAssumeIncluded = false;

  for (const item of items) {
    const parsed = parseBillingCost(item.billingCost);
    if (parsed.kind === "usd") {
      billingUsdSum += parsed.value as number;
      hasBillingUsd = true;
    } else if (
      parsed.kind === "label" &&
      isIncludedBillingLabel(parsed.value as string)
    ) {
      includedCount += 1;
    } else if (parsed.kind === "empty" && item.assumeIncludedWhenEmpty) {
      includedCount += 1;
      anyAssumeIncluded = true;
    }

    const est = item.estimate?.usd;
    if (est != null && Number.isFinite(est)) {
      estimatedSum += est;
      hasEstimate = true;
    }
  }

  if (!hasBillingUsd && includedCount === 0 && !hasEstimate) {
    return { billingLabel: null, estimatedUsd: null, display: "—" };
  }

  let syntheticBilling: string | null = null;
  if (hasBillingUsd && includedCount > 0) {
    const usdLabel = formatUsd(billingUsdSum);
    const includedPart =
      includedCount === 1 ? "1 included" : `${includedCount} included`;
    syntheticBilling = `${usdLabel} + ${includedPart}`;
  } else if (hasBillingUsd) {
    syntheticBilling = String(billingUsdSum);
  } else if (includedCount > 0) {
    syntheticBilling = "Included";
  }

  const estimate: CostEstimate | null = hasEstimate
    ? { usd: estimatedSum, model: "", rateSource: "unknown" }
    : null;

  return formatUsageCost({
    billingCost: syntheticBilling,
    estimate,
    mode,
    assumeIncludedWhenEmpty:
      anyAssumeIncluded && !hasBillingUsd && includedCount > 0,
  });
}

export function providerRowToLineItem(
  row: ProviderUsageParsedRow,
): UsageCostLineItem {
  return {
    billingCost: row.cost,
    estimate: estimateCursorRowCost(row),
    assumeIncludedWhenEmpty: false,
  };
}
