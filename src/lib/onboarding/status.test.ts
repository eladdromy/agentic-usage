import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSettings = vi.hoisted(() => {
  const base = {
    planMonthlyUsd: null,
    planLabel: null,
    planSource: "auto" as const,
    planOverrides: {},
    claudeHomeOverride: null,
    vscdbPathOverride: null,
    activeHarness: "cursor" as const,
    syncDebounceMinutes: 1 as const,
    syncMethod: "updates_only" as const,
    onboardingStartedAt: "2026-09-08T10:00:00.000Z",
    onboardingCompletedAt: null,
    onboardingClaudeSubscriptionApproved: true,
    onboardingCursorSubscriptionApproved: true,
    onboardingCursorProjectSyncDone: true,
    onboardingDeferredCursor: false,
  };
  return { current: { ...base } };
});

vi.mock("@/lib/db/usage-db", () => ({
  getEventCount: vi.fn(() => 0),
}));

vi.mock("@/lib/cursor/provider-usage-db", () => ({
  providerUsageDbHasRows: vi.fn(() => false),
}));

vi.mock("@/lib/claude/discovery", () => ({
  claudeHomeExists: vi.fn(() => true),
  discoverClaudeJsonlFiles: vi.fn(() => []),
}));

vi.mock("@/lib/cursor/path", () => ({
  cursorVscdbExists: vi.fn(() => true),
  getDefaultGlobalDbPath: vi.fn(() => "/tmp/state.vscdb"),
  getResolvedVscdbPath: vi.fn(() => "/tmp/state.vscdb"),
}));

vi.mock("@/lib/claude/path", () => ({
  getClaudeHome: vi.fn(() => "/tmp/.claude"),
  getResolvedClaudeHome: vi.fn(() => "/tmp/.claude"),
  getDataDir: vi.fn(() => "/tmp/.data"),
}));

vi.mock("@/lib/cursor/billing-project-attach", () => ({
  buildProjectSyncMonthsPayload: vi.fn(() => ({ months: [] })),
}));

vi.mock("@/lib/profile/settings", () => ({
  readSettings: () => mockSettings.current,
  writeSettings: (next: typeof mockSettings.current) => {
    mockSettings.current = next;
  },
}));

import { providerUsageDbHasRows } from "@/lib/cursor/provider-usage-db";
import { getEventCount } from "@/lib/db/usage-db";
import {
  completeOnboarding,
  isOnboardingComplete,
} from "@/lib/onboarding/status";

describe("onboarding finalize", () => {
  beforeEach(() => {
    mockSettings.current = {
      ...mockSettings.current,
      activeHarness: "cursor",
      onboardingCompletedAt: null,
      onboardingStartedAt: "2026-09-08T10:00:00.000Z",
    };
    vi.mocked(getEventCount).mockReturnValue(100);
    vi.mocked(providerUsageDbHasRows).mockReturnValue(true);
  });

  it("does not treat indexed data alone as onboarding complete", () => {
    expect(isOnboardingComplete()).toBe(false);
  });

  it("sets activeHarness to all when both harnesses finalize", () => {
    const next = completeOnboarding({
      claudeReady: true,
      cursorReady: true,
      deferredCursor: false,
    });

    expect(next.activeHarness).toBe("all");
    expect(next.onboardingCompletedAt).toBeTruthy();
    expect(isOnboardingComplete(next)).toBe(true);
  });
});
