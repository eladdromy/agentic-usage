import {
  fetchItemTableKeyLikeMap,
  getItemTableValue,
} from "@/lib/cursor/item-table";
import { cursorVscdbExists } from "@/lib/cursor/path";
import type { PlanConfig } from "@/lib/profile/settings";

const APPLICATION_USER_KEY =
  "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser";
const STATSIG_BOOTSTRAP_KEY = "workbench.experiments.statsigBootstrap";

export type CursorProfileSubscription = {
  stripeMembershipType: string | null;
  stripeSubscriptionStatus: string | null;
  membershipType: string | null;
  subscriptionStatus: string | null;
};

export type CursorProfilePayload = {
  account: {
    cachedEmail: string | null;
  };
  subscription: CursorProfileSubscription;
  teams: {
    isEnterprise: boolean | null;
  };
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

function boolOrNull(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function parseApplicationUser(raw: string | null): {
  membershipType: string | null;
  subscriptionStatus: string | null;
  isEnterprise: boolean | null;
} {
  const defaults = {
    membershipType: null as string | null,
    subscriptionStatus: null as string | null,
    isEnterprise: null as boolean | null,
  };
  if (!raw?.trim()) return defaults;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return defaults;

    return {
      membershipType: strOrNull(parsed.membershipType),
      subscriptionStatus: strOrNull(parsed.subscriptionStatus),
      isEnterprise: boolOrNull(parsed.isEnterprise),
    };
  } catch {
    return defaults;
  }
}

function parseStatsigSubscription(raw: string | null): Partial<CursorProfileSubscription> {
  if (!raw?.trim()) return {};

  try {
    const root = JSON.parse(raw) as unknown;
    const userWrap = isPlainObject(root) ? root.user : null;
    if (!isPlainObject(userWrap)) return {};

    const custom = isPlainObject(userWrap.custom) ? userWrap.custom : null;
    if (!custom) return {};

    return {
      stripeMembershipType: strOrNull(custom.stripeMembershipStatus),
      stripeSubscriptionStatus: strOrNull(custom.stripeSubscriptionStatus),
    };
  } catch {
    return {};
  }
}

export function buildCursorProfilePayload(input: {
  authMap: Record<string, string>;
  appUserRaw: string | null;
  statsigRaw: string | null;
}): CursorProfilePayload {
  const getAuth = (suffix: string): string | null =>
    strOrNull(input.authMap[`cursorAuth/${suffix}`] ?? null);

  const appParsed = parseApplicationUser(input.appUserRaw);
  const statsigSub = parseStatsigSubscription(input.statsigRaw);

  return {
    account: {
      cachedEmail: getAuth("cachedEmail"),
    },
    subscription: {
      stripeMembershipType:
        getAuth("stripeMembershipType") ?? statsigSub.stripeMembershipType ?? null,
      stripeSubscriptionStatus:
        getAuth("stripeSubscriptionStatus") ??
        statsigSub.stripeSubscriptionStatus ??
        null,
      membershipType: appParsed.membershipType,
      subscriptionStatus: appParsed.subscriptionStatus,
    },
    teams: {
      isEnterprise: appParsed.isEnterprise,
    },
  };
}

export function queryCursorProfile(dbPath: string): CursorProfilePayload {
  const authMap = fetchItemTableKeyLikeMap(dbPath, "cursorAuth/%");
  const appUserRaw = getItemTableValue(dbPath, APPLICATION_USER_KEY);
  const statsigRaw = getItemTableValue(dbPath, STATSIG_BOOTSTRAP_KEY);
  return buildCursorProfilePayload({ authMap, appUserRaw, statsigRaw });
}

export function readCursorProfile(dbPath: string): CursorProfilePayload | null {
  if (!cursorVscdbExists(dbPath)) return null;
  try {
    return queryCursorProfile(dbPath);
  } catch {
    return null;
  }
}

function normalizeTier(raw: string | null): string {
  if (!raw?.trim()) return "";
  return raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function formatTierLabel(raw: string): string {
  return raw
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveCursorTierId(profile: CursorProfilePayload): string {
  if (profile.teams.isEnterprise) return "enterprise";

  for (const raw of [
    profile.subscription.stripeMembershipType,
    profile.subscription.membershipType,
  ]) {
    const tier = normalizeTier(raw);
    if (tier) return tier;
  }

  return "";
}

/** Map Cursor vscdb membership strings to list price for plan leverage. */
export function detectCursorPlanFromProfile(
  profile: CursorProfilePayload | null,
): PlanConfig | null {
  if (!profile) return null;

  const tier = resolveCursorTierId(profile);
  if (!tier) return null;

  if (tier.includes("ultra")) {
    return { label: "Ultra", monthlyUsd: 200, source: "auto" };
  }
  if (
    tier.includes("pro-plus") ||
    tier.includes("proplus") ||
    tier === "pro-plus"
  ) {
    return { label: "Pro+", monthlyUsd: 60, source: "auto" };
  }
  if (
    tier.includes("premium") &&
    (tier.includes("team") || tier.includes("business"))
  ) {
    return { label: "Teams Premium", monthlyUsd: 120, source: "auto" };
  }
  if (tier.includes("team") || tier.includes("business")) {
    return { label: "Teams", monthlyUsd: 40, source: "auto" };
  }
  if (tier.includes("pro")) {
    return { label: "Pro", monthlyUsd: 20, source: "auto" };
  }
  if (tier.includes("hobby") || tier.includes("free")) {
    return { label: "Hobby", monthlyUsd: 0, source: "auto" };
  }
  if (tier.includes("enterprise")) {
    return null;
  }

  const raw =
    profile.subscription.stripeMembershipType ??
    profile.subscription.membershipType;
  if (raw) {
    return { label: formatTierLabel(raw), monthlyUsd: 20, source: "auto" };
  }

  return null;
}
