import { describe, expect, it, vi, beforeEach } from "vitest";

import type { AppSettings } from "@/lib/profile/settings";

const mockSettings = vi.hoisted(() => {
  const base: AppSettings = {
    planMonthlyUsd: null,
    planLabel: null,
    planSource: "auto",
    planOverrides: {},
    claudeHomeOverride: null,
    vscdbPathOverride: null,
    activeHarness: "cursor",
    syncDebounceMinutes: 1,
    syncMethod: "updates_only",
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
  writeSettings: (next: AppSettings) => {
    mockSettings.current = next;
  },
}));

import { providerUsageDbHasRows } from "@/lib/cursor/provider-usage-db";
import { getEventCount } from "@/lib/db/usage-db";
import {
  completeOnboarding,
  isLegacyOnboardingInstall,
  isOnboardingComplete,
  markOnboardingStarted,
  migrateLegacyOnboardingIfNeeded,
} from "@/lib/onboarding/status";

function legacySettings(): AppSettings {
  return {
    planMonthlyUsd: null,
    planLabel: null,
    planSource: "auto",
    planOverrides: {},
    claudeHomeOverride: null,
    vscdbPathOverride: null,
    activeHarness: null,
    syncDebounceMinutes: 1,
    syncMethod: "updates_only",
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    onboardingClaudeSubscriptionApproved: false,
    onboardingCursorSubscriptionApproved: false,
    onboardingCursorProjectSyncDone: false,
    onboardingDeferredCursor: false,
  };
}

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

describe("legacy onboarding migration", () => {
  beforeEach(() => {
    mockSettings.current = legacySettings();
    vi.mocked(getEventCount).mockReturnValue(0);
    vi.mocked(providerUsageDbHasRows).mockReturnValue(false);
  });

  it("detects legacy installs with indexed data and no wizard session", () => {
    vi.mocked(getEventCount).mockReturnValue(42);
    expect(isLegacyOnboardingInstall()).toBe(true);

    mockSettings.current = {
      ...legacySettings(),
      onboardingStartedAt: "2026-09-08T10:00:00.000Z",
    };
    expect(isLegacyOnboardingInstall()).toBe(false);
  });

  it("auto-completes legacy Claude installs on migration", () => {
    vi.mocked(getEventCount).mockReturnValue(42);

    const migrated = migrateLegacyOnboardingIfNeeded();

    expect(migrated.onboardingCompletedAt).toBeTruthy();
    expect(migrated.onboardingClaudeSubscriptionApproved).toBe(true);
    expect(migrated.onboardingStartedAt).toBeNull();
    expect(isOnboardingComplete(migrated)).toBe(true);
  });

  it("migrates legacy installs instead of marking wizard started", () => {
    vi.mocked(providerUsageDbHasRows).mockReturnValue(true);

    const next = markOnboardingStarted();

    expect(next.onboardingCompletedAt).toBeTruthy();
    expect(next.onboardingCursorSubscriptionApproved).toBe(true);
    expect(next.onboardingCursorProjectSyncDone).toBe(true);
    expect(next.onboardingStartedAt).toBeNull();
  });
});
