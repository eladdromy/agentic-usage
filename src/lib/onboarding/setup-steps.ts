import type { HarnessKind } from "@/lib/profile/settings";

export type HarnessSetupProgress = {
  harness: HarnessKind;
  step: number;
  total: number;
};

export const CLAUDE_SETUP_STEP_TOTAL = 2;
export const CURSOR_SETUP_STEP_TOTAL = 3;

export const CLAUDE_SETUP_STEPS = {
  sync: { harness: "claude" as const, step: 1, total: CLAUDE_SETUP_STEP_TOTAL },
  subscription: {
    harness: "claude" as const,
    step: 2,
    total: CLAUDE_SETUP_STEP_TOTAL,
  },
};

export const CURSOR_SETUP_STEPS = {
  upload: { harness: "cursor" as const, step: 1, total: CURSOR_SETUP_STEP_TOTAL },
  sync: { harness: "cursor" as const, step: 2, total: CURSOR_SETUP_STEP_TOTAL },
  subscription: {
    harness: "cursor" as const,
    step: 3,
    total: CURSOR_SETUP_STEP_TOTAL,
  },
};
