import type { ModelRate } from "./usage-cost-types";

const AS_OF = "2026-09-07";

/** Per-million-token rates. Cursor official table: cursor.com/docs/models-and-pricing */
function rate(
  inputPerM: number,
  outputPerM: number,
  opts?: {
    cacheCreatePerM?: number;
    cacheReadPerM?: number;
    source?: ModelRate["source"];
  },
): ModelRate {
  return {
    inputPerToken: inputPerM / 1_000_000,
    outputPerToken: outputPerM / 1_000_000,
    cacheCreatePerToken:
      opts?.cacheCreatePerM != null ? opts.cacheCreatePerM / 1_000_000 : null,
    cacheReadPerToken:
      opts?.cacheReadPerM != null ? opts.cacheReadPerM / 1_000_000 : null,
    source: opts?.source ?? "litellm",
    asOf: AS_OF,
  };
}

/** Cursor Models pool — Grok + Composer (cursor.com/docs/models-and-pricing). */
const CURSOR_MODELS_RATES: Record<string, ModelRate> = {
  "grok-4.6": rate(2.0, 6.0, { cacheReadPerM: 0.5, source: "cursor-official" }),
  "grok-4.6-fast": rate(4.0, 12.0, {
    cacheReadPerM: 1.0,
    source: "cursor-official",
  }),
  "grok-4.5": rate(2.0, 6.0, { cacheReadPerM: 0.5, source: "cursor-official" }),
  "grok-4.5-fast": rate(4.0, 18.0, {
    cacheReadPerM: 1.0,
    source: "cursor-official",
  }),
  "composer-2.5-fast": rate(3.0, 15.0, {
    cacheReadPerM: 0.5,
    source: "cursor-official",
  }),
  "composer-2-fast": rate(1.5, 7.5, {
    cacheReadPerM: 0.35,
    source: "cursor-official",
  }),
  "composer-2.5": rate(0.5, 2.5, {
    cacheReadPerM: 0.2,
    source: "cursor-official",
  }),
  "composer-2": rate(0.5, 2.5, {
    cacheReadPerM: 0.2,
    source: "cursor-official",
  }),
  "composer-1.5": rate(3.5, 17.5, {
    cacheReadPerM: 0.35,
    source: "cursor-official",
  }),
  "composer-1": rate(1.25, 10.0, {
    cacheReadPerM: 0.125,
    source: "cursor-official",
  }),
  "cursor-composer": rate(0.5, 2.5, {
    cacheReadPerM: 0.2,
    source: "cursor-official",
  }),
  "cursor-fast": rate(1.5, 7.5, {
    cacheReadPerM: 0.35,
    source: "cursor-official",
  }),
  "cursor-small": rate(0.15, 0.6, { source: "cursor-official" }),
  "cursor-lite": rate(0.1, 0.4, { source: "cursor-official" }),
  auto: rate(1.25, 6.0, {
    cacheCreatePerM: 1.25,
    cacheReadPerM: 0.25,
    source: "cursor-official",
  }),
};

const LITELLM_RATES: Record<string, ModelRate> = {
  "claude-sonnet-4-20250514": rate(3.0, 15.0, {
    cacheCreatePerM: 3.75,
    cacheReadPerM: 0.3,
  }),
  "claude-sonnet-4-5": rate(3.0, 15.0, {
    cacheCreatePerM: 3.75,
    cacheReadPerM: 0.3,
  }),
  "claude-sonnet-4-5-20250929": rate(3.0, 15.0, {
    cacheCreatePerM: 3.75,
    cacheReadPerM: 0.3,
  }),
  "claude-sonnet-4-6": rate(3.0, 15.0, {
    cacheCreatePerM: 3.75,
    cacheReadPerM: 0.3,
  }),
  "claude-4-sonnet-20250514": rate(3.0, 15.0, {
    cacheCreatePerM: 3.75,
    cacheReadPerM: 0.3,
  }),
  "claude-3-7-sonnet-20250219": rate(3.0, 15.0, {
    cacheCreatePerM: 3.75,
    cacheReadPerM: 0.3,
  }),
  "claude-opus-4-1-20250805": rate(15.0, 75.0, {
    cacheCreatePerM: 18.75,
    cacheReadPerM: 1.5,
  }),
  "claude-opus-4-1": rate(15.0, 75.0, {
    cacheCreatePerM: 18.75,
    cacheReadPerM: 1.5,
  }),
  "claude-opus-4-20250514": rate(15.0, 75.0, {
    cacheCreatePerM: 18.75,
    cacheReadPerM: 1.5,
  }),
  "claude-4-opus-20250514": rate(15.0, 75.0, {
    cacheCreatePerM: 18.75,
    cacheReadPerM: 1.5,
  }),
  "claude-opus-4-5": rate(5.0, 25.0, {
    cacheCreatePerM: 6.25,
    cacheReadPerM: 0.5,
  }),
  "claude-opus-4-6": rate(5.0, 25.0, {
    cacheCreatePerM: 6.25,
    cacheReadPerM: 0.5,
  }),
  "claude-opus-4-7": rate(5.0, 25.0, {
    cacheCreatePerM: 6.25,
    cacheReadPerM: 0.5,
  }),
  "claude-opus-4-8": rate(5.0, 25.0, {
    cacheCreatePerM: 6.25,
    cacheReadPerM: 0.5,
  }),
  "claude-haiku-4-5": rate(1.0, 5.0, {
    cacheCreatePerM: 1.25,
    cacheReadPerM: 0.1,
  }),
  "claude-haiku-4-5-20251001": rate(1.0, 5.0, {
    cacheCreatePerM: 1.25,
    cacheReadPerM: 0.1,
  }),
  "claude-3-haiku-20240307": rate(0.25, 1.25, {
    cacheCreatePerM: 0.3,
    cacheReadPerM: 0.03,
  }),
  "gpt-4o": rate(2.5, 10.0, { cacheReadPerM: 1.25 }),
  "gpt-4o-mini": rate(0.15, 0.6, { cacheReadPerM: 0.075 }),
  "gpt-4.1": rate(2.0, 8.0, { cacheReadPerM: 0.5 }),
  "gpt-4.1-mini": rate(0.4, 1.6, { cacheReadPerM: 0.1 }),
  "gpt-4.1-nano": rate(0.1, 0.4, { cacheReadPerM: 0.025 }),
  o3: rate(2.0, 8.0, { cacheReadPerM: 0.5 }),
  "o3-mini": rate(1.1, 4.4, { cacheReadPerM: 0.55 }),
  "o4-mini": rate(1.1, 4.4, { cacheReadPerM: 0.275 }),
  "gpt-5": rate(1.25, 10.0, { cacheReadPerM: 0.125 }),
  "gpt-5-mini": rate(0.25, 2.0, { cacheReadPerM: 0.025 }),
  "gpt-5.1": rate(1.25, 10.0, { cacheReadPerM: 0.125 }),
  "gpt-5.1-codex": rate(1.25, 10.0, { cacheReadPerM: 0.125 }),
  "gpt-5.1-codex-max": rate(1.25, 10.0, { cacheReadPerM: 0.125 }),
  "gpt-5.1-codex-mini": rate(0.25, 2.0, { cacheReadPerM: 0.025 }),
  "gpt-5.2": rate(1.75, 14.0, { cacheReadPerM: 0.175 }),
  "gpt-5.2-codex": rate(1.75, 14.0, { cacheReadPerM: 0.175 }),
  "gpt-5.3-codex": rate(1.75, 14.0, { cacheReadPerM: 0.175 }),
  "gpt-5.4": rate(2.5, 15.0, { cacheReadPerM: 0.25 }),
  "gpt-5.4-mini": rate(0.75, 4.5, { cacheReadPerM: 0.075 }),
  "gpt-5.4-nano": rate(0.2, 1.25, { cacheReadPerM: 0.02 }),
  "gpt-5.5": rate(5.0, 30.0, { cacheReadPerM: 0.5 }),
  "gpt-5.6-luna": rate(0.2, 1.2, {
    cacheCreatePerM: 0.25,
    cacheReadPerM: 0.02,
  }),
  "gpt-5.6-sol": rate(4.0, 20.0, {
    cacheCreatePerM: 5.0,
    cacheReadPerM: 0.4,
  }),
  "gpt-5.6-terra": rate(2.0, 12.0, {
    cacheCreatePerM: 2.5,
    cacheReadPerM: 0.2,
  }),
  "gemini-2.5-pro": rate(1.25, 10.0, { cacheReadPerM: 0.125 }),
  "gemini-2.5-flash": rate(0.3, 2.5, { cacheReadPerM: 0.03 }),
  "gemini-2.0-flash": rate(0.1, 0.4, { cacheReadPerM: 0.025 }),
  "gemini-3-flash": rate(0.5, 3.0, { cacheReadPerM: 0.05 }),
  "gemini-3.1-pro": rate(2.0, 12.0, { cacheReadPerM: 0.2 }),
  "gemini-3.5-flash": rate(1.5, 9.0, { cacheReadPerM: 0.15 }),
  "gemini-3.6-flash": rate(1.5, 7.5, { cacheReadPerM: 0.15 }),
  "gemini-3.7-flash": rate(0.75, 3.5, { cacheReadPerM: 0.075 }),
  "gemini-3.8-flash": rate(0.75, 3.5, { cacheReadPerM: 0.075 }),
  "grok-4.3": rate(1.25, 2.5, { cacheReadPerM: 0.2 }),
  "grok-build-0.1": rate(1.0, 2.0),
  "kimi-k2.5": rate(0.6, 3.0, { cacheReadPerM: 0.1 }),
  "kimi-k2.7-code": rate(0.95, 4.0, { cacheReadPerM: 0.19 }),
  "kimi-k3": rate(3.0, 15.0, { cacheReadPerM: 0.3 }),
  "glm-5.2": rate(1.4, 4.4, { cacheReadPerM: 0.26 }),
};

const ALL_RATES: Record<string, ModelRate> = {
  ...LITELLM_RATES,
  ...CURSOR_MODELS_RATES,
};

const MODEL_ALIASES: Record<string, string> = {
  default: "auto",
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "claude-opus-4": "claude-opus-4-20250514",
};

export function normalizeModelName(
  model: string | null | undefined,
): string | null {
  const trimmed = model?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function isCursorNativeModel(model: string | null | undefined): boolean {
  const n = normalizeModelName(model);
  if (!n) return false;
  return (
    n.startsWith("composer-") ||
    n.startsWith("cursor-") ||
    n.startsWith("grok-") ||
    n === "auto" ||
    n === "default"
  );
}

export function isAnthropicFamilyModel(
  model: string | null | undefined,
): boolean {
  const n = normalizeModelName(model);
  if (!n) return false;
  return (
    n.includes("claude") ||
    n.includes("opus") ||
    n.includes("sonnet") ||
    n.includes("haiku")
  );
}

/** Anthropic + Auto use a distinct cache-write bucket; Grok/Composer/GPT/Gemini use unified input. */
export function isCacheWriteBucketApplicable(
  model: string | null | undefined,
): boolean {
  const n = normalizeModelName(model);
  if (!n) return false;
  if (n === "auto" || n === "default") return true;
  return isAnthropicFamilyModel(model);
}

export function resolveModelRate(model: string | null | undefined): ModelRate | null {
  const n = normalizeModelName(model);
  if (!n) return null;

  const alias = MODEL_ALIASES[n];
  if (alias && ALL_RATES[alias]) return ALL_RATES[alias];

  if (ALL_RATES[n]) return ALL_RATES[n];

  const withoutDate = n.replace(/-\d{8}$/, "");
  if (ALL_RATES[withoutDate]) return ALL_RATES[withoutDate];

  let best: ModelRate | null = null;
  let bestLen = 0;
  for (const [key, rateEntry] of Object.entries(ALL_RATES)) {
    if (n.startsWith(key) && key.length > bestLen) {
      best = rateEntry;
      bestLen = key.length;
    }
  }
  if (best) return best;

  if (n.includes("sonnet")) return ALL_RATES["claude-sonnet-4-6"] ?? null;
  if (n.includes("opus")) return ALL_RATES["claude-opus-4-8"] ?? null;
  if (n.includes("haiku")) return ALL_RATES["claude-haiku-4-5"] ?? null;
  if (n.includes("composer")) {
    if (n.includes("fast")) return ALL_RATES["composer-2.5-fast"] ?? null;
    return ALL_RATES["composer-2.5"] ?? null;
  }
  if (n.includes("grok")) {
    if (n.includes("fast")) {
      if (n.includes("4.6")) return ALL_RATES["grok-4.6-fast"] ?? null;
      return ALL_RATES["grok-4.5-fast"] ?? null;
    }
    if (n.includes("4.6")) return ALL_RATES["grok-4.6"] ?? null;
    if (n.includes("4.5")) return ALL_RATES["grok-4.5"] ?? null;
    return ALL_RATES["grok-4.6"] ?? ALL_RATES["grok-4.3"] ?? null;
  }
  if (n.includes("gpt-4o-mini")) return ALL_RATES["gpt-4o-mini"] ?? null;
  if (n.includes("gpt-4o")) return ALL_RATES["gpt-4o"] ?? null;
  if (n.includes("gpt-4.1")) return ALL_RATES["gpt-4.1"] ?? null;
  if (n.includes("gpt-5.6")) {
    if (n.includes("luna")) return ALL_RATES["gpt-5.6-luna"] ?? null;
    if (n.includes("sol")) return ALL_RATES["gpt-5.6-sol"] ?? null;
    if (n.includes("terra")) return ALL_RATES["gpt-5.6-terra"] ?? null;
  }
  if (n.includes("gpt-5")) return ALL_RATES["gpt-5.4"] ?? ALL_RATES["gpt-5"] ?? null;
  if (n.includes("gemini") && n.includes("3")) {
    if (n.includes("flash")) return ALL_RATES["gemini-3.8-flash"] ?? null;
    if (n.includes("pro")) return ALL_RATES["gemini-3.1-pro"] ?? null;
  }
  if (n.includes("gemini") && n.includes("pro")) {
    return ALL_RATES["gemini-2.5-pro"] ?? null;
  }
  if (n.includes("gemini") && n.includes("flash")) {
    return ALL_RATES["gemini-2.5-flash"] ?? null;
  }
  if (n.includes("kimi")) return ALL_RATES["kimi-k3"] ?? ALL_RATES["kimi-k2.5"] ?? null;
  if (n.includes("glm")) return ALL_RATES["glm-5.2"] ?? null;

  if (n === "default") return ALL_RATES.auto ?? null;

  return null;
}
