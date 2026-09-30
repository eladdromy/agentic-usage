import type { ProjectSyncJobSnapshot } from "@/lib/cursor/project-sync-client";

/** Result when project sync has no months to process. */
export type EmptyProjectSyncTargetResult =
  | { kind: "modal_toast" }
  | { kind: "inline_complete"; snapshot: ProjectSyncJobSnapshot };

/**
 * Settings modal vs onboarding inline UI when every billing row is already linked.
 * Onboarding must still mark the step finished so Continue enables.
 */
export function resolveEmptyProjectSyncTarget(
  useModal: boolean,
  bubbleIndexReady: boolean,
): EmptyProjectSyncTargetResult {
  if (useModal) {
    return { kind: "modal_toast" };
  }
  return {
    kind: "inline_complete",
    snapshot: {
      phase: "done",
      bubbleIndexReady,
      months: [],
      status: "done",
      finished: true,
    },
  };
}
