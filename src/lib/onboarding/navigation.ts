import type { OnboardingSuggestedFlow } from "@/lib/profile/settings";
import type { OnboardingStatus } from "@/lib/onboarding/status";

export function setupEntryPath(status: OnboardingStatus): string {
  const { suggestedFlow, ready, detected } = status;

  if (suggestedFlow === "none") {
    return "/setup/paths";
  }

  if (suggestedFlow === "cursor" || (suggestedFlow === "both" && !detected.claude)) {
    if (status.settings.traceMode?.cursor == null) return "/setup/cursor/mode";
    if (!status.cursorHasCsv) return "/setup/cursor/upload";
    if (cursorTraceIndexPending(status)) return "/setup/cursor/sync";
    if (!ready.cursor && !status.settings.onboardingCursorProjectSyncDone) {
      return "/setup/cursor/sync";
    }
    if (!ready.cursor) return "/setup/cursor/subscription";
    return "/setup/complete";
  }

  if (!ready.claude) {
    const claudeTraceMode = status.settings.traceMode?.claude;
    if (claudeTraceMode == null) return "/setup/claude/mode";
    if (
      status.claudeEventCount === 0 ||
      (claudeTraceMode === "full_tracing" &&
        !status.settings.onboardingClaudeTraceIndexed)
    ) {
      return "/setup/claude/sync";
    }
    if (!status.settings.onboardingClaudeSubscriptionApproved) {
      return "/setup/claude/subscription";
    }
  }

  if (suggestedFlow === "both" && ready.claude && !ready.cursor) {
    if (status.settings.onboardingDeferredCursor) {
      return "/setup/complete";
    }
    if (!status.cursorHasCsv) {
      return status.settings.onboardingClaudeSubscriptionApproved
        ? "/setup/cursor/offer"
        : "/setup/claude/subscription";
    }
    if (
      !status.settings.onboardingCursorProjectSyncDone ||
      cursorTraceIndexPending(status)
    ) {
      return "/setup/cursor/sync";
    }
    if (!status.settings.onboardingCursorSubscriptionApproved) {
      return "/setup/cursor/subscription";
    }
  }

  if (
    cursorTraceIndexPending(status) &&
    detected.cursor &&
    status.cursorHasCsv &&
    !status.settings.onboardingDeferredCursor
  ) {
    return "/setup/cursor/sync";
  }

  if (ready.claude || ready.cursor) {
    return "/setup/complete";
  }

  return "/setup/claude/sync";
}

export function nextPathAfterClaudeMode(): string {
  return "/setup/claude/sync";
}

export function nextPathAfterClaudeSync(): string {
  return "/setup/claude/subscription";
}

function cursorTraceIndexPending(status: OnboardingStatus): boolean {
  return (
    status.settings.traceMode?.cursor === "full_tracing" &&
    !status.settings.onboardingCursorTraceIndexed
  );
}

export function nextPathAfterCursorMode(): string {
  return "/setup/cursor/upload";
}

export function nextPathAfterClaudeSubscription(
  status: OnboardingStatus,
): string {
  if (status.suggestedFlow === "both" && status.detected.cursor) {
    return "/setup/cursor/offer";
  }
  return "/setup/complete";
}

export function nextPathAfterCursorUpload(): string {
  return "/setup/cursor/sync";
}

export function nextPathAfterCursorSync(): string {
  return "/setup/cursor/subscription";
}

export function nextPathAfterCursorSubscription(): string {
  return "/setup/complete";
}

export function flowLabel(flow: OnboardingSuggestedFlow): string {
  switch (flow) {
    case "both":
      return "Claude Code and Cursor";
    case "claude":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    default:
      return "No harness detected";
  }
}
