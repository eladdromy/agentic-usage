import {
  claudeHomeExists,
  discoverClaudeJsonlFiles,
} from "@/lib/claude/discovery";
import {
  getClaudeHome,
  getResolvedClaudeHome,
} from "@/lib/claude/path";
import { buildProjectSyncMonthsPayload } from "@/lib/cursor/billing-project-attach";
import { providerUsageDbHasRows } from "@/lib/cursor/provider-usage-db";
import {
  cursorVscdbExists,
  getDefaultGlobalDbPath,
  getResolvedVscdbPath,
} from "@/lib/cursor/path";
import { getEventCount } from "@/lib/db/usage-db";
import {
  readSettings,
  writeSettings,
  type AppSettings,
  type HarnessKind,
  type OnboardingSuggestedFlow,
} from "@/lib/profile/settings";

export type HarnessAvailability = {
  claude: boolean;
  cursor: boolean;
};

export type OnboardingDetected = {
  claude: boolean;
  cursor: boolean;
  claudeLogFiles: number;
};

export type OnboardingReady = {
  claude: boolean;
  cursor: boolean;
};

export type OnboardingStatus = {
  detected: OnboardingDetected;
  ready: OnboardingReady;
  harnessAvailability: HarnessAvailability;
  onboardingComplete: boolean;
  suggestedFlow: OnboardingSuggestedFlow;
  paths: {
    claudeHome: string;
    vscdbPath: string;
    defaultVscdbPath: string;
  };
  settings: Pick<
    AppSettings,
    | "claudeHomeOverride"
    | "vscdbPathOverride"
    | "onboardingCompletedAt"
    | "onboardingClaudeSubscriptionApproved"
    | "onboardingCursorSubscriptionApproved"
    | "onboardingCursorProjectSyncDone"
    | "onboardingDeferredCursor"
    | "activeHarness"
  >;
  claudeEventCount: number;
  cursorHasCsv: boolean;
};

function cursorProjectSyncSatisfied(settings: AppSettings): boolean {
  if (settings.onboardingCursorProjectSyncDone) return true;
  if (!providerUsageDbHasRows()) return false;
  try {
    const payload = buildProjectSyncMonthsPayload();
    if (payload.months.length === 0) return true;
    return payload.months.every((month) => month.pendingRows === 0);
  } catch {
    return false;
  }
}

export function isClaudeHarnessReady(settings: AppSettings): boolean {
  return (
    getEventCount() > 0 && settings.onboardingClaudeSubscriptionApproved
  );
}

export function isCursorHarnessReady(settings: AppSettings): boolean {
  return (
    providerUsageDbHasRows() &&
    cursorProjectSyncSatisfied(settings) &&
    settings.onboardingCursorSubscriptionApproved
  );
}

export function isOnboardingComplete(settings?: AppSettings): boolean {
  const s = settings ?? readSettings();
  return Boolean(s.onboardingCompletedAt);
}

/** Pre-onboarding installs with indexed data but no wizard session. */
export function isLegacyOnboardingInstall(settings?: AppSettings): boolean {
  const s = settings ?? readSettings();
  if (s.onboardingCompletedAt || s.onboardingStartedAt) return false;
  return getEventCount() > 0 || providerUsageDbHasRows();
}

export function markOnboardingStarted(settings?: AppSettings): AppSettings {
  const current = settings ?? readSettings();
  if (current.onboardingStartedAt) return current;
  const next: AppSettings = {
    ...current,
    onboardingStartedAt: new Date().toISOString(),
  };
  writeSettings(next);
  return next;
}

export function migrateLegacyOnboardingIfNeeded(settings?: AppSettings): AppSettings {
  const current = settings ?? readSettings();
  if (!isLegacyOnboardingInstall(current)) return current;

  const claudeReady = getEventCount() > 0;
  const cursorReady = providerUsageDbHasRows();
  const next = completeOnboarding({
    claudeReady,
    cursorReady,
    deferredCursor: false,
  });

  const migrated: AppSettings = {
    ...next,
    onboardingClaudeSubscriptionApproved:
      claudeReady || current.onboardingClaudeSubscriptionApproved,
    onboardingCursorSubscriptionApproved:
      cursorReady || current.onboardingCursorSubscriptionApproved,
    onboardingCursorProjectSyncDone:
      cursorReady || current.onboardingCursorProjectSyncDone,
  };
  writeSettings(migrated);
  return migrated;
}

export function resolveSuggestedFlow(
  detected: Pick<OnboardingDetected, "claude" | "cursor">,
): OnboardingSuggestedFlow {
  if (detected.claude && detected.cursor) return "both";
  if (detected.claude) return "claude";
  if (detected.cursor) return "cursor";
  return "none";
}

/** Cursor installed locally but billing CSV not imported yet. */
export function needsCursorSetup(settings?: AppSettings): boolean {
  const s = settings ?? readSettings();
  const detected = detectHarnesses(s);
  return detected.cursor && !providerUsageDbHasRows();
}

/** Navbar / harness switch: installed harnesses after onboarding, full readiness during setup. */
export function resolveHarnessAvailability(
  settings: AppSettings,
): HarnessAvailability {
  const detected = detectHarnesses(settings);
  const hasClaudeData = getEventCount() > 0;
  const hasCursorData = providerUsageDbHasRows();

  if (
    isOnboardingComplete(settings) ||
    hasClaudeData ||
    hasCursorData
  ) {
    return {
      claude: detected.claude || hasClaudeData,
      cursor: detected.cursor || hasCursorData,
    };
  }

  return {
    claude: isClaudeHarnessReady(settings),
    cursor: isCursorHarnessReady(settings),
  };
}

export function resolveHarnessNavOptions(
  settings: AppSettings,
): HarnessAvailability {
  const detected = detectHarnesses(settings);
  const availability = resolveHarnessAvailability(settings);
  return {
    claude: availability.claude || detected.claude,
    cursor: availability.cursor || detected.cursor,
  };
}

export function detectHarnesses(settings: AppSettings): OnboardingDetected {
  const claudeHome = getResolvedClaudeHome(settings.claudeHomeOverride);
  const claude = claudeHomeExists(settings.claudeHomeOverride);
  const vscdbPath = getResolvedVscdbPath(settings.vscdbPathOverride);
  const cursor = cursorVscdbExists(vscdbPath);
  const claudeLogFiles = claude
    ? discoverClaudeJsonlFiles(settings.claudeHomeOverride).length
    : 0;

  return { claude, cursor, claudeLogFiles };
}

export function buildOnboardingStatus(settings?: AppSettings): OnboardingStatus {
  const s = settings ?? readSettings();
  const detected = detectHarnesses(s);
  const ready = {
    claude: isClaudeHarnessReady(s),
    cursor: isCursorHarnessReady(s),
  };

  return {
    detected,
    ready,
    harnessAvailability: resolveHarnessAvailability(s),
    onboardingComplete: isOnboardingComplete(s),
    suggestedFlow: resolveSuggestedFlow(detected),
    paths: {
      claudeHome: getResolvedClaudeHome(s.claudeHomeOverride),
      vscdbPath: getResolvedVscdbPath(s.vscdbPathOverride),
      defaultVscdbPath: getDefaultGlobalDbPath(),
    },
    settings: {
      claudeHomeOverride: s.claudeHomeOverride,
      vscdbPathOverride: s.vscdbPathOverride,
      onboardingCompletedAt: s.onboardingCompletedAt,
      onboardingClaudeSubscriptionApproved: s.onboardingClaudeSubscriptionApproved,
      onboardingCursorSubscriptionApproved: s.onboardingCursorSubscriptionApproved,
      onboardingCursorProjectSyncDone: s.onboardingCursorProjectSyncDone,
      onboardingDeferredCursor: s.onboardingDeferredCursor,
      activeHarness: s.activeHarness,
    },
    claudeEventCount: getEventCount(),
    cursorHasCsv: providerUsageDbHasRows(),
  };
}

export type CompleteOnboardingInput = {
  claudeReady: boolean;
  cursorReady: boolean;
  deferredCursor: boolean;
};

export function completeOnboarding(input: CompleteOnboardingInput): AppSettings {
  const current = readSettings();
  const detected = detectHarnesses(current);
  let activeHarness = current.activeHarness;
  let deferredCursor = input.deferredCursor;

  if (input.claudeReady && input.cursorReady) {
    activeHarness = "all";
    deferredCursor = false;
  } else if (input.cursorReady) {
    activeHarness = "cursor";
  } else if (input.claudeReady) {
    if (detected.cursor || input.deferredCursor) {
      activeHarness = "all";
      deferredCursor = detected.cursor && !input.cursorReady;
    } else {
      activeHarness = "claude";
    }
  }

  const next: AppSettings = {
    ...current,
    activeHarness,
    onboardingCompletedAt: new Date().toISOString(),
    onboardingDeferredCursor: deferredCursor,
  };
  return next;
}

export function resolveEffectiveHarness(
  settings: AppSettings,
  availability: HarnessAvailability,
): HarnessKind | "all" {
  const active = settings.activeHarness ?? "claude";
  if (active === "all") {
    if (availability.claude && availability.cursor) return "all";
    if (availability.claude) return "claude";
    if (availability.cursor) return "cursor";
    return "claude";
  }
  if (optionsIncludes(availability, active)) return active;
  if (availability.claude) return "claude";
  if (availability.cursor) return "cursor";
  return "claude";
}

function optionsIncludes(
  availability: HarnessAvailability,
  harness: HarnessKind | "all",
): boolean {
  if (harness === "all") return availability.claude && availability.cursor;
  return availability[harness];
}
