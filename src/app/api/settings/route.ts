import { NextResponse } from "next/server";

import {
  readSettings,
  writeSettings,
  normalizePlanOverrides,
  type ActiveHarness,
  type AppSettings,
  type SyncDebounceMinutes,
  type SyncMethod,
} from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(readSettings());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<AppSettings>;
  const current = readSettings();

  const syncDebounceMinutes: SyncDebounceMinutes =
    body.syncDebounceMinutes === 5 || body.syncDebounceMinutes === 10
      ? body.syncDebounceMinutes
      : body.syncDebounceMinutes === 1
        ? 1
        : current.syncDebounceMinutes;

  const syncMethod: SyncMethod =
    body.syncMethod === "full" || body.syncMethod === "updates_only"
      ? body.syncMethod
      : current.syncMethod;

  const activeHarness: ActiveHarness | null =
    body.activeHarness === "claude" ||
    body.activeHarness === "cursor" ||
    body.activeHarness === "all"
      ? body.activeHarness
      : body.activeHarness === null
        ? null
        : current.activeHarness;

  const next: AppSettings = {
    planMonthlyUsd:
      typeof body.planMonthlyUsd === "number"
        ? body.planMonthlyUsd
        : current.planMonthlyUsd,
    planLabel:
      typeof body.planLabel === "string" ? body.planLabel : current.planLabel,
    planSource:
      body.planSource === "manual"
        ? "manual"
        : body.planSource === "auto"
          ? "auto"
          : current.planSource,
    planOverrides:
      body.planOverrides !== undefined
        ? normalizePlanOverrides(body.planOverrides)
        : current.planOverrides,
    claudeHomeOverride:
      body.claudeHomeOverride === null
        ? null
        : typeof body.claudeHomeOverride === "string"
          ? body.claudeHomeOverride
          : current.claudeHomeOverride,
    vscdbPathOverride:
      body.vscdbPathOverride === null
        ? null
        : typeof body.vscdbPathOverride === "string"
          ? body.vscdbPathOverride
          : current.vscdbPathOverride,
    activeHarness,
    syncDebounceMinutes,
    syncMethod,
    onboardingCompletedAt:
      body.onboardingCompletedAt === null
        ? null
        : typeof body.onboardingCompletedAt === "string"
          ? body.onboardingCompletedAt
          : current.onboardingCompletedAt,
    onboardingClaudeSubscriptionApproved:
      body.onboardingClaudeSubscriptionApproved === true
        ? true
        : body.onboardingClaudeSubscriptionApproved === false
          ? false
          : current.onboardingClaudeSubscriptionApproved,
    onboardingCursorSubscriptionApproved:
      body.onboardingCursorSubscriptionApproved === true
        ? true
        : body.onboardingCursorSubscriptionApproved === false
          ? false
          : current.onboardingCursorSubscriptionApproved,
    onboardingCursorProjectSyncDone:
      body.onboardingCursorProjectSyncDone === true
        ? true
        : body.onboardingCursorProjectSyncDone === false
          ? false
          : current.onboardingCursorProjectSyncDone,
    onboardingDeferredCursor:
      body.onboardingDeferredCursor === true
        ? true
        : body.onboardingDeferredCursor === false
          ? false
          : current.onboardingDeferredCursor,
  };

  writeSettings(next);
  return NextResponse.json(next);
}
