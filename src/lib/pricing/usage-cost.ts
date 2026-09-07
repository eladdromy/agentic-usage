import { resolveModelRate } from "./model-pricing";
import type { ClaudeMessageUsage } from "@/lib/claude/types";
import type { CostEstimate, TokenBuckets } from "./usage-cost-types";

export function tokensFromClaudeUsage(usage: ClaudeMessageUsage): TokenBuckets {
  const cc = usage.cache_creation ?? {};
  const c5 = cc.ephemeral_5m_input_tokens ?? 0;
  const c1h = cc.ephemeral_1h_input_tokens ?? 0;
  const totalCreate = usage.cache_creation_input_tokens ?? 0;

  let cacheCreate5m = c5;
  const cacheCreate1h = c1h;
  if (c5 === 0 && c1h === 0 && totalCreate > 0) {
    cacheCreate5m = totalCreate;
  }

  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheCreate5m,
    cacheCreate1h,
    cacheRead: usage.cache_read_input_tokens ?? 0,
  };
}

export function cacheWriteBucketsFromAggregated(parts: {
  cacheWriteTokens: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
}): { cacheCreate5m: number; cacheCreate1h: number } {
  let cacheCreate5m = parts.cacheCreate5m;
  const cacheCreate1h = parts.cacheCreate1h;
  if (
    cacheCreate5m === 0 &&
    cacheCreate1h === 0 &&
    parts.cacheWriteTokens > 0
  ) {
    cacheCreate5m = parts.cacheWriteTokens;
  }
  return { cacheCreate5m, cacheCreate1h };
}

export function claudeTokenBucketsFromDb(parts: {
  inputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheCreate5m: number | null;
  cacheCreate1h: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
}): TokenBuckets {
  const input = parts.inputTokens ?? 0;
  const output = parts.outputTokens ?? 0;
  const cacheRead = parts.cacheReadTokens ?? 0;
  const cacheWrite = parts.cacheWriteTokens ?? 0;
  const { cacheCreate5m, cacheCreate1h } = cacheWriteBucketsFromAggregated({
    cacheWriteTokens: cacheWrite,
    cacheCreate5m: parts.cacheCreate5m ?? 0,
    cacheCreate1h: parts.cacheCreate1h ?? 0,
  });

  return { input, output, cacheCreate5m, cacheCreate1h, cacheRead };
}

export function costFromTokenBuckets(
  buckets: TokenBuckets,
  model: string,
): CostEstimate {
  const rate = resolveModelRate(model);
  if (!rate) {
    return { usd: null, model, rateSource: "unknown" };
  }

  const cacheCreatePrice = rate.cacheCreatePerToken ?? rate.inputPerToken;
  const cacheReadPrice = rate.cacheReadPerToken ?? rate.inputPerToken;

  const usd =
    buckets.input * rate.inputPerToken +
    buckets.output * rate.outputPerToken +
    buckets.cacheCreate5m * cacheCreatePrice +
    buckets.cacheCreate1h * rate.inputPerToken * 2 +
    buckets.cacheRead * cacheReadPrice;

  return { usd, model, rateSource: rate.source };
}

export function estimateClaudeUsageCostFromDb(parts: {
  model: string | null;
  inputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheCreate5m: number | null;
  cacheCreate1h: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
}): number | null {
  const model = parts.model?.trim();
  if (!model) return null;

  const buckets = claudeTokenBucketsFromDb(parts);
  const hasTokens =
    buckets.input > 0 ||
    buckets.output > 0 ||
    buckets.cacheCreate5m > 0 ||
    buckets.cacheCreate1h > 0 ||
    buckets.cacheRead > 0;
  if (!hasTokens) return null;

  return costFromTokenBuckets(buckets, model).usd;
}

export function estimateClaudeUsageCost(
  usage: ClaudeMessageUsage,
  model: string,
): number | null {
  const buckets = tokensFromClaudeUsage(usage);
  const hasTokens =
    buckets.input > 0 ||
    buckets.output > 0 ||
    buckets.cacheCreate5m > 0 ||
    buckets.cacheCreate1h > 0 ||
    buckets.cacheRead > 0;
  if (!hasTokens) return null;
  return costFromTokenBuckets(buckets, model).usd;
}
