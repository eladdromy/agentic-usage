import { formatDistanceToNowStrict } from "date-fns";

export function formatTokenCount(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatCostUsd(
  value: number | null | undefined,
  opts?: { approx?: boolean },
): string {
  if (value == null) return "—";
  const prefix = opts?.approx ? "~$" : "$";
  if (value >= 100) return `${prefix}${value.toFixed(0)}`;
  if (value >= 10) return `${prefix}${value.toFixed(1)}`;
  if (value >= 1) return `${prefix}${value.toFixed(2)}`;
  return `${prefix}${value.toFixed(3)}`;
}

/** Plan Leverage page — whole dollars, rounded up, with thousands separators. */
export function formatPlanLeverageUsd(
  value: number | null | undefined,
): string {
  if (value == null) return "—";
  const ceiled = Math.ceil(value);
  return `$${ceiled.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Projects breakdown — rounded up to one decimal, with thousands separators. */
export function formatProjectBreakdownUsd(
  value: number | null | undefined,
  opts?: { approx?: boolean },
): string {
  if (value == null || value <= 0) return "—";
  const prefix = opts?.approx ? "~$" : "$";
  const ceiled = Math.ceil(value * 10) / 10;
  const formatted = ceiled.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${prefix}${formatted}`;
}

export function formatLeverageMultiplier(leverage: number): string {
  const rounded = Math.round(leverage * 10) / 10;
  const formatted = rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `×${formatted}`;
}

export function formatPlanLeverageExposureLabel(
  apiEqvUsd: number,
  planSpendUsd: number,
): string {
  if (apiEqvUsd === 0 && planSpendUsd === 0) return "—";
  return formatPlanLeverageUsd(computePlanExposureUsd(apiEqvUsd, planSpendUsd));
}

/** API eq numeric: billed on-demand when present, else token estimate. */
export function numericApiEqUsd(
  billedUsd: number | null | undefined,
  estimatedUsd: number | null | undefined,
): number {
  if (billedUsd != null && billedUsd > 0) return billedUsd;
  if (estimatedUsd != null && Number.isFinite(estimatedUsd)) return estimatedUsd;
  return 0;
}

/** API eq. minus plan spend, floored at zero — upside if suppliers stop subsidizing or you switch to pay-as-you-go. */
export function computePlanExposureUsd(
  apiEqvUsd: number,
  planSpendUsd: number,
): number {
  return Math.max(0, apiEqvUsd - planSpendUsd);
}

export function formatPlanExposureLabel(
  apiEqvUsd: number,
  planSpendUsd: number,
): string {
  if (apiEqvUsd === 0 && planSpendUsd === 0) return "—";
  return formatCostUsd(computePlanExposureUsd(apiEqvUsd, planSpendUsd));
}

/** API eq label — exact $ for on-demand, ~$ for token estimates. */
export function formatApiEqCostLabel(
  billedUsd: number | null | undefined,
  estimatedUsd: number | null | undefined,
): string {
  const usd = numericApiEqUsd(billedUsd, estimatedUsd);
  if (usd <= 0) return "—";
  const isEstimate = !(billedUsd != null && billedUsd > 0);
  return formatCostUsd(usd, { approx: isEstimate });
}

/** Claude log `costUSD` — subscription usage vs on-demand API spend. */
export function formatClaudeBillingCostLabel(
  costUsd: number | null | undefined,
): string {
  if (costUsd == null || costUsd <= 0) return "Included";
  return formatCostUsd(costUsd);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Projects breakdown — first to last billed request, e.g. Aug 22 → Aug 27, 2026. */
export function formatYearMonthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const month0 = Number(month.slice(5, 7)) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(month0)) return month;
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatProjectRequestRange(
  firstActivitySec: number,
  lastActivitySec: number,
): string {
  if (firstActivitySec <= 0 || lastActivitySec <= 0) return "—";

  const first = new Date(firstActivitySec * 1000);
  const last = new Date(lastActivitySec * 1000);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return "—";

  const withYear = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const withoutYear = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  if (firstActivitySec >= lastActivitySec) {
    return withYear(first);
  }

  const sameYear = first.getFullYear() === last.getFullYear();
  if (sameYear) {
    return `${withoutYear(first)} → ${withoutYear(last)}, ${first.getFullYear()}`;
  }

  return `${withYear(first)} → ${withYear(last)}`;
}

export function toRelativeTimeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function shortSessionId(sessionId: string): string {
  if (!sessionId) return "—";
  return sessionId.length > 8 ? `${sessionId.slice(0, 8)}…` : sessionId;
}

export function shortComposerId(composerId: string): string {
  return shortSessionId(composerId);
}
