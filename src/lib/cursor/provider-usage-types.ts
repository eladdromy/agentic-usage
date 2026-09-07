import type { FormattedUsageCost, UsageCostMode } from "@/lib/pricing/usage-cost-types";

/** Canonical CSV columns (legacy fixed-order export). Optional columns may appear in newer exports. */
export const PROVIDER_USAGE_CSV_COLUMNS = [
  "Date",
  "Cloud Agent ID",
  "Automation ID",
  "Kind",
  "Model",
  "Max Mode",
  "Input (w/ Cache Write)",
  "Input (w/o Cache Write)",
  "Cache Read",
  "Output Tokens",
  "Total Tokens",
  "Cost",
] as const;

export const PROVIDER_USAGE_OPTIONAL_CSV_COLUMNS = ["Project"] as const;

/** Required for a valid usage-events export (resolved by header name). */
export const PROVIDER_USAGE_REQUIRED_CSV_COLUMNS = [
  "Date",
  "Kind",
  "Model",
  "Input (w/ Cache Write)",
  "Input (w/o Cache Write)",
  "Cache Read",
  "Output Tokens",
  "Total Tokens",
  "Cost",
] as const;

export interface ProviderUsageParsedRow {
  date: string;
  cloudAgentId: string;
  automationId: string;
  kind: string;
  model: string;
  maxMode: string;
  project: string;
  composerId: string;
  inputWithCacheWrite: number | null;
  inputWithoutCacheWrite: number | null;
  cacheRead: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: string;
  rowHash: string;
}

export interface ProviderUsageUploadResult {
  inserted: number;
  skipped: number;
  totalParsed: number;
  filename: string;
}

export interface ProviderUsageEventsPayload {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  costMode: UsageCostMode;
  columns: string[];
  rows: Record<string, string>[];
  costDisplays: FormattedUsageCost[];
  bounds: {
    minDateSec: number | null;
    maxDateSec: number | null;
  };
}
