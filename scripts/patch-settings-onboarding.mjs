#!/usr/bin/env node
/**
 * Patch onboarding-related fields in .data/settings.json after harness data resets.
 *
 * Usage:
 *   node scripts/patch-settings-onboarding.mjs claude
 *   node scripts/patch-settings-onboarding.mjs cursor
 *   AGENTIC_USAGE_DATA_DIR=/custom/dir node scripts/patch-settings-onboarding.mjs claude
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const harness = process.argv[2];
if (harness !== "claude" && harness !== "cursor") {
  console.error("Usage: patch-settings-onboarding.mjs <claude|cursor>");
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.AGENTIC_USAGE_DATA_DIR ?? path.join(repoRoot, ".data");
const settingsPath = path.join(dataDir, "settings.json");

if (!fs.existsSync(settingsPath)) {
  console.log("No settings.json — skipping onboarding flag reset.");
  process.exit(0);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

settings.onboardingCompletedAt = null;
settings.onboardingStartedAt = null;

if (harness === "claude") {
  settings.onboardingClaudeSubscriptionApproved = false;
  if (settings.planOverrides?.claude) {
    delete settings.planOverrides.claude;
  }
} else {
  settings.onboardingCursorSubscriptionApproved = false;
  settings.onboardingCursorProjectSyncDone = false;
  settings.onboardingDeferredCursor = false;
  if (settings.planOverrides?.cursor) {
    delete settings.planOverrides.cursor;
  }
}

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`Reset ${harness} onboarding flags in settings.json`);
