import type { HarnessKind } from "@/lib/profile/settings";

export type HarnessSetupProgress = {
  harness: HarnessKind;
  step: number;
  total: number;
};

/** Claude: mode -> one index (spend, plus traces when chosen) -> subscription. */
export const CLAUDE_SETUP_STEP_TOTAL = 3;

export function claudeModeProgress(): HarnessSetupProgress {
  return { harness: "claude", step: 1, total: CLAUDE_SETUP_STEP_TOTAL };
}

export function claudeSyncProgress(): HarnessSetupProgress {
  return { harness: "claude", step: 2, total: CLAUDE_SETUP_STEP_TOTAL };
}

export function claudeSubscriptionProgress(): HarnessSetupProgress {
  return { harness: "claude", step: 3, total: CLAUDE_SETUP_STEP_TOTAL };
}

/** Cursor: mode -> upload -> sync (project link, plus traces when chosen) -> subscription. */
export const CURSOR_SETUP_STEP_TOTAL = 4;

export const CURSOR_SETUP_STEPS = {
  mode: { harness: "cursor" as const, step: 1, total: CURSOR_SETUP_STEP_TOTAL },
  upload: { harness: "cursor" as const, step: 2, total: CURSOR_SETUP_STEP_TOTAL },
  sync: { harness: "cursor" as const, step: 3, total: CURSOR_SETUP_STEP_TOTAL },
  subscription: {
    harness: "cursor" as const,
    step: 4,
    total: CURSOR_SETUP_STEP_TOTAL,
  },
};
