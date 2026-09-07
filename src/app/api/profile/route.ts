import { NextResponse } from "next/server";

import { claudeConfigExists, claudeHomeExists } from "@/lib/claude/discovery";
import { getClaudeHome, getDataDir } from "@/lib/claude/path";
import {
  detectCursorPlanFromProfile,
  readCursorProfile,
} from "@/lib/cursor/cursor-profile";
import {
  getLastProviderImportAt,
  queryProviderUsageEventCount,
} from "@/lib/cursor/provider-usage-db";
import {
  cursorVscdbExists,
  cursorVscdbMtimeMs,
  getDefaultGlobalDbPath,
  getResolvedVscdbPath,
} from "@/lib/cursor/path";
import { getEventCount, getLastSyncAt } from "@/lib/db/usage-db";
import {
  detectClaudePlanFromProfile,
  readClaudeProfile,
  readSettings,
  resolveActiveHarness,
  resolvePlanConfig,
} from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function GET() {
  const profile = readClaudeProfile();
  const settings = readSettings();
  const activeHarness = resolveActiveHarness(settings);
  const vscdbPath = getResolvedVscdbPath(settings.vscdbPathOverride);
  const cursorProfile = readCursorProfile(vscdbPath);
  const detectedClaudePlan = detectClaudePlanFromProfile(profile);
  const detectedCursorPlan = detectCursorPlanFromProfile(cursorProfile);
  const detectedPlan =
    activeHarness === "cursor"
      ? detectedCursorPlan
      : activeHarness === "claude"
        ? detectedClaudePlan
        : null;
  const plan = resolvePlanConfig(activeHarness);
  const claudePlan = resolvePlanConfig("claude");
  const cursorPlan = resolvePlanConfig("cursor");

  return NextResponse.json({
    claudeHome: getClaudeHome(),
    dataDir: getDataDir(),
    claudeHomeExists: claudeHomeExists(),
    claudeConfigExists: claudeConfigExists(),
    vscdbPath,
    defaultVscdbPath: getDefaultGlobalDbPath(),
    vscdbExists: cursorVscdbExists(vscdbPath),
    vscdbMtimeMs: cursorVscdbExists(vscdbPath)
      ? cursorVscdbMtimeMs(vscdbPath)
      : null,
    activeHarness,
    eventCount:
      activeHarness === "all"
        ? getEventCount() + queryProviderUsageEventCount()
        : activeHarness === "cursor"
          ? queryProviderUsageEventCount()
          : getEventCount(),
    lastSyncAt:
      activeHarness === "all"
        ? getLastSyncAt() ?? getLastProviderImportAt()
        : activeHarness === "cursor"
          ? getLastProviderImportAt()
          : getLastSyncAt(),
    claudeEventCount: getEventCount(),
    cursorEventCount: queryProviderUsageEventCount(),
    claudeLastSyncAt: getLastSyncAt(),
    cursorLastSyncAt: getLastProviderImportAt(),
    profile,
    cursorProfile,
    detectedClaudePlan,
    detectedCursorPlan,
    detectedPlan,
    plan,
    claudePlan,
    cursorPlan,
    settings,
  });
}
