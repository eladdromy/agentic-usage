export type ModelRate = {
  inputPerToken: number;
  outputPerToken: number;
  cacheCreatePerToken: number | null;
  cacheReadPerToken: number | null;
  source: string;
  asOf: string;
};

export type TokenBuckets = {
  input: number;
  output: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
  cacheRead: number;
};

export type UsageCostMode = "display" | "calculate" | "auto" | "both";

export type ModelRateSource = "litellm" | "cursor-official" | "unknown";

export interface NormalizedTokenUsage {
  inputWithoutCacheWrite: number;
  inputWithCacheWrite: number;
  cacheRead: number;
  outputTokens: number;
}

export type CostEstimate = {
  usd: number | null;
  model: string;
  rateSource: string;
};

export interface FormattedUsageCost {
  billingLabel: string | null;
  estimatedUsd: number | null;
  display: string;
}

export type BillingCostKind = "usd" | "label" | "empty";

export interface ParsedBillingCost {
  kind: BillingCostKind;
  value: string | number | null;
}

export interface UsageCostLineItem {
  billingCost: string | null | undefined;
  estimate: CostEstimate | null;
  assumeIncludedWhenEmpty?: boolean;
}
