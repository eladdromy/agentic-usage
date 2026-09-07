import type { HarnessKind } from "@/lib/profile/settings";

export type PlanTierPreset = {
  id: string;
  label: string;
  monthlyUsd: number;
};

export const CUSTOM_PLAN_TIER_ID = "custom";
export const AUTO_PLAN_TIER_ID = "auto";

export const CLAUDE_PLAN_TIERS: PlanTierPreset[] = [
  { id: "free", label: "Free", monthlyUsd: 0 },
  { id: "pro", label: "Pro", monthlyUsd: 20 },
  { id: "max-5x", label: "Max 5×", monthlyUsd: 100 },
  { id: "max-20x", label: "Max 20×", monthlyUsd: 200 },
  { id: "team-standard", label: "Team Standard", monthlyUsd: 25 },
  { id: "team-premium", label: "Team Premium", monthlyUsd: 125 },
];

export const CURSOR_PLAN_TIERS: PlanTierPreset[] = [
  { id: "hobby", label: "Hobby", monthlyUsd: 0 },
  { id: "pro", label: "Pro", monthlyUsd: 20 },
  { id: "pro-plus", label: "Pro+", monthlyUsd: 60 },
  { id: "ultra", label: "Ultra", monthlyUsd: 200 },
  { id: "teams", label: "Teams", monthlyUsd: 40 },
  { id: "teams-premium", label: "Teams Premium", monthlyUsd: 120 },
];

export function planTiersForHarness(harness: HarnessKind): PlanTierPreset[] {
  return harness === "cursor" ? CURSOR_PLAN_TIERS : CLAUDE_PLAN_TIERS;
}

export function findPlanTierPreset(
  harness: HarnessKind,
  tierId: string,
): PlanTierPreset | null {
  return planTiersForHarness(harness).find((tier) => tier.id === tierId) ?? null;
}

export function formatPlanTierOptionLabel(tier: PlanTierPreset): string {
  return `${tier.label} ($${tier.monthlyUsd}/mo)`;
}
