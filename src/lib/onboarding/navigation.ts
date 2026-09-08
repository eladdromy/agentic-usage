import type { OnboardingSuggestedFlow } from "@/lib/profile/settings";
import type { OnboardingStatus } from "@/lib/onboarding/status";

export function setupEntryPath(status: OnboardingStatus): string {
  const { suggestedFlow, ready, detected } = status;

  if (suggestedFlow === "none") {
    return "/setup/paths";
  }

  if (suggestedFlow === "cursor" || (suggestedFlow === "both" && !detected.claude)) {
    if (!status.cursorHasCsv) return "/setup/cursor/upload";
    if (!ready.cursor && !status.settings.onboardingCursorProjectSyncDone) {
      return "/setup/cursor/sync";
    }
    if (!ready.cursor) return "/setup/cursor/subscription";
    return "/setup/complete";
  }

  if (!ready.claude) {
    if (status.claudeEventCount === 0) return "/setup/claude/sync";
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
    if (!status.settings.onboardingCursorProjectSyncDone) {
      return "/setup/cursor/sync";
    }
    if (!status.settings.onboardingCursorSubscriptionApproved) {
      return "/setup/cursor/subscription";
    }
  }

  if (ready.claude || ready.cursor) {
    return "/setup/complete";
  }

  return "/setup/claude/sync";
}

export function nextPathAfterClaudeSync(status: OnboardingStatus): string {
  return "/setup/claude/subscription";
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
