import { describe, expect, it } from "vitest";

import type { OnboardingStatus } from "@/lib/onboarding/status";
import { setupEntryPath } from "@/lib/onboarding/navigation";

function baseStatus(
  overrides: Partial<OnboardingStatus> = {},
): OnboardingStatus {
  return {
    detected: { claude: true, cursor: true, claudeLogFiles: 1 },
    ready: { claude: false, cursor: false },
    harnessAvailability: { claude: true, cursor: true },
    onboardingComplete: false,
    suggestedFlow: "cursor",
    paths: {
      claudeHome: "/tmp/.claude",
      vscdbPath: "/tmp/state.vscdb",
      defaultVscdbPath: "/tmp/state.vscdb",
    },
    settings: {
      claudeHomeOverride: null,
      vscdbPathOverride: null,
      onboardingCompletedAt: null,
      onboardingClaudeSubscriptionApproved: false,
      onboardingCursorSubscriptionApproved: false,
      onboardingCursorProjectSyncDone: false,
      onboardingClaudeTraceIndexed: false,
      onboardingCursorTraceIndexed: false,
      onboardingDeferredCursor: false,
      traceMode: { cursor: "spend_only" },
      activeHarness: "cursor",
    },
    claudeEventCount: 0,
    cursorHasCsv: true,
    ...overrides,
  };
}

describe("setupEntryPath cursor trace indexing", () => {
  it("routes to sync while cursor full tracing is not indexed", () => {
    const path = setupEntryPath(
      baseStatus({
        settings: {
          ...baseStatus().settings,
          traceMode: { cursor: "full_tracing" },
          onboardingCursorTraceIndexed: false,
          onboardingCursorProjectSyncDone: true,
        },
      }),
    );
    expect(path).toBe("/setup/cursor/sync");
  });

  it("routes to subscription after project sync and cursor trace index", () => {
    const path = setupEntryPath(
      baseStatus({
        ready: { claude: false, cursor: false },
        settings: {
          ...baseStatus().settings,
          traceMode: { cursor: "full_tracing" },
          onboardingCursorTraceIndexed: true,
          onboardingCursorProjectSyncDone: true,
        },
      }),
    );
    expect(path).toBe("/setup/cursor/subscription");
  });

  it("both-flow returns to cursor sync when trace index is still pending", () => {
    const path = setupEntryPath(
      baseStatus({
        suggestedFlow: "both",
        ready: { claude: true, cursor: false },
        settings: {
          ...baseStatus().settings,
          traceMode: { cursor: "full_tracing" },
          onboardingClaudeSubscriptionApproved: true,
          onboardingCursorProjectSyncDone: true,
          onboardingCursorTraceIndexed: false,
        },
      }),
    );
    expect(path).toBe("/setup/cursor/sync");
  });
});
