import type { HarnessKind, TraceMode } from "@/lib/profile/settings";

export type HarnessSetupProgress = {
  harness: HarnessKind;
  step: number;
  total: number;
};

/** Claude: mode -> sync -> [trace if full] -> subscription. */
export function claudeSetupTotal(traceMode: TraceMode): number {
  return traceMode === "full_tracing" ? 4 : 3;
}

export function claudeModeProgress(): HarnessSetupProgress {
  // Total is unknown before the choice is made; show the spend-only baseline.
  return { harness: "claude", step: 1, total: 3 };
}

export function claudeSyncProgress(traceMode: TraceMode): HarnessSetupProgress {
  return { harness: "claude", step: 2, total: claudeSetupTotal(traceMode) };
}

export function claudeTraceProgress(): HarnessSetupProgress {
  return { harness: "claude", step: 3, total: 4 };
}

export function claudeSubscriptionProgress(
  traceMode: TraceMode,
): HarnessSetupProgress {
  const total = claudeSetupTotal(traceMode);
  return { harness: "claude", step: total, total };
}

/** Cursor: mode -> upload -> sync -> subscription (tracing is 'Coming soon'). */
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
