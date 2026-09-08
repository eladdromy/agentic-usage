import fs from "fs";

import { claudeHomeExists } from "@/lib/claude/discovery";
import { getClaudeGlobalConfigPath, getDataDir } from "@/lib/claude/path";
import {
  detectCursorPlanFromProfile,
  readCursorProfile,
} from "@/lib/cursor/cursor-profile";
import {
  cursorVscdbExists,
  getResolvedVscdbPath,
} from "@/lib/cursor/path";

export type HarnessKind = "claude" | "cursor";
export type ActiveHarness = HarnessKind | "all";

export type PlanConfig = {
  label: string;
  monthlyUsd: number;
  source: "auto" | "manual";
};

/** Per-month subscription override for a harness (YYYY-MM key). */
export type MonthlyPlanOverride = {
  tierId: string;
  label: string;
  monthlyUsd: number;
};

export type HarnessPlanOverrides = Record<string, MonthlyPlanOverride>;

export type PlanOverridesByHarness = Partial<
  Record<HarnessKind, HarnessPlanOverrides>
>;

export const SYNC_DEBOUNCE_MINUTES = [1, 5, 10] as const;
export type SyncDebounceMinutes = (typeof SYNC_DEBOUNCE_MINUTES)[number];
export type SyncMethod = "updates_only" | "full";

export type OnboardingSuggestedFlow = "claude" | "cursor" | "both" | "none";

export type AppSettings = {
  /** @deprecated Use planOverrides per month instead */
  planMonthlyUsd: number | null;
  /** @deprecated Use planOverrides per month instead */
  planLabel: string | null;
  /** @deprecated Use planOverrides per month instead */
  planSource: "auto" | "manual";
  planOverrides: PlanOverridesByHarness;
  claudeHomeOverride: string | null;
  vscdbPathOverride: string | null;
  activeHarness: ActiveHarness | null;
  syncDebounceMinutes: SyncDebounceMinutes;
  syncMethod: SyncMethod;
  /** Set when the user enters /setup — distinguishes wizard-in-progress from legacy installs. */
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  onboardingClaudeSubscriptionApproved: boolean;
  onboardingCursorSubscriptionApproved: boolean;
  onboardingCursorProjectSyncDone: boolean;
  onboardingDeferredCursor: boolean;
};

export type ClaudeProfile = {
  emailAddress: string | null;
  seatTier: string | null;
  organizationType: string | null;
  userRateLimitTier: string | null;
  organizationRateLimitTier: string | null;
  billingType: string | null;
};

const DEFAULT_SETTINGS: AppSettings = {
  planMonthlyUsd: null,
  planLabel: null,
  planSource: "auto",
  planOverrides: {},
  claudeHomeOverride: null,
  vscdbPathOverride: null,
  activeHarness: null,
  syncDebounceMinutes: 1,
  syncMethod: "updates_only",
  onboardingStartedAt: null,
  onboardingCompletedAt: null,
  onboardingClaudeSubscriptionApproved: false,
  onboardingCursorSubscriptionApproved: false,
  onboardingCursorProjectSyncDone: false,
  onboardingDeferredCursor: false,
};

function parseMonthlyPlanOverride(value: unknown): MonthlyPlanOverride | null {
  if (!isPlainObject(value)) return null;
  const tierId = typeof value.tierId === "string" ? value.tierId.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const monthlyUsd =
    typeof value.monthlyUsd === "number" && Number.isFinite(value.monthlyUsd)
      ? value.monthlyUsd
      : null;
  if (!tierId || !label || monthlyUsd == null) return null;
  return { tierId, label, monthlyUsd };
}

function parseHarnessPlanOverrides(value: unknown): HarnessPlanOverrides {
  if (!isPlainObject(value)) return {};
  const out: HarnessPlanOverrides = {};
  for (const [month, rawOverride] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const parsed = parseMonthlyPlanOverride(rawOverride);
    if (parsed) out[month] = parsed;
  }
  return out;
}

export function normalizePlanOverrides(value: unknown): PlanOverridesByHarness {
  return parsePlanOverrides(value);
}

function parsePlanOverrides(value: unknown): PlanOverridesByHarness {
  if (!isPlainObject(value)) return {};
  const out: PlanOverridesByHarness = {};
  if (value.claude) {
    const claude = parseHarnessPlanOverrides(value.claude);
    if (Object.keys(claude).length > 0) out.claude = claude;
  }
  if (value.cursor) {
    const cursor = parseHarnessPlanOverrides(value.cursor);
    if (Object.keys(cursor).length > 0) out.cursor = cursor;
  }
  return out;
}

function parseActiveHarness(value: unknown): ActiveHarness | null {
  if (value === "claude" || value === "cursor" || value === "all") return value;
  return null;
}

export function detectDefaultHarness(settings?: AppSettings): HarnessKind {
  const s = settings ?? readSettings();
  const hasClaude = claudeHomeExists(s.claudeHomeOverride);
  const hasCursor = cursorVscdbExists(getResolvedVscdbPath(s.vscdbPathOverride));
  if (hasCursor && !hasClaude) return "cursor";
  return "claude";
}

export function resolveActiveHarness(settings?: AppSettings): ActiveHarness {
  const s = settings ?? readSettings();
  return s.activeHarness ?? detectDefaultHarness(s);
}

export function resolveSingleHarness(settings?: AppSettings): HarnessKind {
  const harness = resolveActiveHarness(settings);
  if (harness === "claude" || harness === "cursor") return harness;
  return detectDefaultHarness();
}

function parseSyncDebounceMinutes(value: unknown): SyncDebounceMinutes {
  if (value === 5 || value === 10) return value;
  return 1;
}

function parseSyncMethod(value: unknown): SyncMethod {
  return value === "full" ? "full" : "updates_only";
}

export function syncDebounceMs(minutes: SyncDebounceMinutes): number {
  return minutes * 60_000;
}

function settingsPath(): string {
  return `${getDataDir()}/settings.json`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function readSettings(): AppSettings {
  const fp = settingsPath();
  if (!fs.existsSync(fp)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as unknown;
    if (!isPlainObject(raw)) return { ...DEFAULT_SETTINGS };
    return {
      planMonthlyUsd:
        typeof raw.planMonthlyUsd === "number" ? raw.planMonthlyUsd : null,
      planLabel: typeof raw.planLabel === "string" ? raw.planLabel : null,
      planSource: raw.planSource === "manual" ? "manual" : "auto",
      planOverrides: parsePlanOverrides(raw.planOverrides),
      claudeHomeOverride:
        typeof raw.claudeHomeOverride === "string"
          ? raw.claudeHomeOverride
          : null,
      vscdbPathOverride:
        typeof raw.vscdbPathOverride === "string" ? raw.vscdbPathOverride : null,
      activeHarness: parseActiveHarness(raw.activeHarness),
      syncDebounceMinutes: parseSyncDebounceMinutes(raw.syncDebounceMinutes),
      syncMethod: parseSyncMethod(raw.syncMethod),
      onboardingStartedAt:
        typeof raw.onboardingStartedAt === "string"
          ? raw.onboardingStartedAt
          : null,
      onboardingCompletedAt:
        typeof raw.onboardingCompletedAt === "string"
          ? raw.onboardingCompletedAt
          : null,
      onboardingClaudeSubscriptionApproved:
        raw.onboardingClaudeSubscriptionApproved === true,
      onboardingCursorSubscriptionApproved:
        raw.onboardingCursorSubscriptionApproved === true,
      onboardingCursorProjectSyncDone:
        raw.onboardingCursorProjectSyncDone === true,
      onboardingDeferredCursor: raw.onboardingDeferredCursor === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings: AppSettings): void {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

export function readClaudeProfile(): ClaudeProfile | null {
  const configPath = getClaudeGlobalConfigPath();
  if (!fs.existsSync(configPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    if (!isPlainObject(config)) return null;
    const oauth = config.oauthAccount;
    if (!isPlainObject(oauth)) {
      return {
        emailAddress: null,
        seatTier: null,
        organizationType: null,
        userRateLimitTier: null,
        organizationRateLimitTier: null,
        billingType: null,
      };
    }

    return {
      emailAddress:
        typeof oauth.emailAddress === "string" ? oauth.emailAddress : null,
      seatTier: typeof oauth.seatTier === "string" ? oauth.seatTier : null,
      organizationType:
        typeof oauth.organizationType === "string"
          ? oauth.organizationType
          : null,
      userRateLimitTier:
        typeof oauth.userRateLimitTier === "string"
          ? oauth.userRateLimitTier
          : null,
      organizationRateLimitTier:
        typeof oauth.organizationRateLimitTier === "string"
          ? oauth.organizationRateLimitTier
          : null,
      billingType:
        typeof oauth.billingType === "string" ? oauth.billingType : null,
    };
  } catch {
    return null;
  }
}

function tierContains(tier: string | null | undefined, pattern: string): boolean {
  if (!tier) return false;
  return tier.toLowerCase().includes(pattern.toLowerCase());
}

/** Mirrors Agentic_Usage `planLimitMultiplier` — org type + rate limit tier. */
function planLimitMultiplier(profile: ClaudeProfile): number {
  const tier = `${profile.userRateLimitTier ?? ""} ${profile.organizationRateLimitTier ?? ""}`.toLowerCase();
  if (/20x/.test(tier)) return 20;
  if (/5x/.test(tier)) return 5;

  const org = (profile.organizationType ?? "").toLowerCase();
  if (org.includes("max")) {
    if (/20/.test(org)) return 20;
    if (/5/.test(org)) return 5;
    return 5;
  }
  if (org.includes("free")) return 0.5;
  return 1;
}

/** Mirrors Agentic_Usage `planDisplayLabel`. */
function planDisplayLabel(profile: ClaudeProfile): string {
  const mult = planLimitMultiplier(profile);
  if (mult >= 20) return "Max 20×";
  if (mult >= 5) return "Max 5×";

  const org = (profile.organizationType ?? "").toLowerCase();
  if (org.includes("pro")) return "Pro";
  if (org.includes("max")) return "Max";
  if (org.includes("team")) return "Team";
  if (org.includes("enterprise")) return "Enterprise";
  if (org.includes("free")) return "Free";

  const seat = profile.seatTier?.toLowerCase() ?? "";
  if (seat.includes("pro")) return "Pro";
  if (seat.includes("max")) return "Max";
  if (seat.includes("team")) return "Team";
  if (seat.includes("free")) return "Free";

  const raw = profile.organizationType?.trim() || profile.seatTier?.trim();
  if (raw) {
    return raw.replace(/^claude_/i, "").replace(/_/g, " ");
  }
  return "Unknown";
}

function planMonthlyUsd(profile: ClaudeProfile): number | null {
  const mult = planLimitMultiplier(profile);
  if (mult >= 20) return 200;
  if (mult >= 5) return 100;

  const org = (profile.organizationType ?? "").toLowerCase();
  const seat = profile.seatTier?.toLowerCase() ?? "";
  const combined = `${org} ${seat}`;

  if (combined.includes("pro")) return 20;
  if (combined.includes("team_premium") || tierContains(combined, "premium")) {
    return 125;
  }
  if (combined.includes("team") || seat.includes("standard")) return 25;
  if (combined.includes("free") || profile.billingType === "free") return 0;

  return null;
}

export function detectClaudePlanFromProfile(
  profile: ClaudeProfile | null,
): PlanConfig | null {
  if (!profile) return null;

  const monthlyUsd = planMonthlyUsd(profile);
  const label = planDisplayLabel(profile);

  if (monthlyUsd != null && label !== "Unknown") {
    return { label, monthlyUsd, source: "auto" };
  }

  // Legacy seatTier-only fallbacks when organizationType is absent
  const seat = profile.seatTier?.toLowerCase() ?? "";
  const userTier = profile.userRateLimitTier ?? "";
  const orgTier = profile.organizationRateLimitTier ?? "";
  const combined = `${userTier} ${orgTier} ${seat}`;

  if (tierContains(combined, "20x")) {
    return { label: "Max 20×", monthlyUsd: 200, source: "auto" };
  }
  if (tierContains(combined, "5x") || seat.includes("max")) {
    return { label: "Max 5×", monthlyUsd: 100, source: "auto" };
  }
  if (seat.includes("pro")) {
    return { label: "Pro", monthlyUsd: 20, source: "auto" };
  }
  if (seat.includes("team_premium") || tierContains(combined, "premium")) {
    return { label: "Team Premium", monthlyUsd: 125, source: "auto" };
  }
  if (seat.includes("team") || seat.includes("standard")) {
    return { label: "Team Standard", monthlyUsd: 25, source: "auto" };
  }
  if (seat.includes("free") || profile.billingType === "free") {
    return { label: "Free", monthlyUsd: 0, source: "auto" };
  }

  return null;
}

/** @deprecated Use detectClaudePlanFromProfile */
export const detectPlanFromProfile = detectClaudePlanFromProfile;

function detectPlanForHarness(harness: HarnessKind): PlanConfig | null {
  const settings = readSettings();
  return harness === "cursor"
    ? detectCursorPlanFromProfile(
        readCursorProfile(getResolvedVscdbPath(settings.vscdbPathOverride)),
      )
    : detectClaudePlanFromProfile(readClaudeProfile());
}

function resolveMonthlyPlanOverride(
  settings: AppSettings,
  harness: HarnessKind,
  month?: string,
): PlanConfig | null {
  if (!month) return null;
  const override = settings.planOverrides[harness]?.[month];
  if (!override) return null;
  return {
    label: override.label,
    monthlyUsd: override.monthlyUsd,
    source: "manual",
  };
}

function resolveLegacyGlobalPlanOverride(
  settings: AppSettings,
): PlanConfig | null {
  if (settings.planSource !== "manual" || settings.planMonthlyUsd == null) {
    return null;
  }
  return {
    label: settings.planLabel ?? "Custom",
    monthlyUsd: settings.planMonthlyUsd,
    source: "manual",
  };
}

export function resolvePlanConfig(
  harness?: ActiveHarness | HarnessKind,
  month?: string,
): PlanConfig | null {
  const settings = readSettings();
  const activeHarness =
    harness != null && harness !== "all"
      ? harness
      : resolveSingleHarness(settings);

  const monthlyOverride = resolveMonthlyPlanOverride(
    settings,
    activeHarness,
    month,
  );
  if (monthlyOverride) return monthlyOverride;

  const detected = detectPlanForHarness(activeHarness);
  if (detected) return detected;

  const legacy = resolveLegacyGlobalPlanOverride(settings);
  if (legacy) return legacy;

  if (settings.planMonthlyUsd != null) {
    return {
      label: settings.planLabel ?? "Custom",
      monthlyUsd: settings.planMonthlyUsd,
      source: settings.planSource,
    };
  }

  return null;
}

export function computeLeverage(
  apiEqvUsd: number,
  planMonthlyUsd: number,
): number | null {
  if (planMonthlyUsd <= 0) return null;
  return apiEqvUsd / planMonthlyUsd;
}

export { formatLeverageMultiplier } from "@/lib/format";
