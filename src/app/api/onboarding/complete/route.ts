import { NextResponse } from "next/server";

import {
  buildOnboardingStatus,
  completeOnboarding,
  isClaudeHarnessReady,
  isCursorHarnessReady,
} from "@/lib/onboarding/status";
import { readSettings, writeSettings } from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { deferredCursor?: boolean };
  const current = readSettings();
  const claudeReady = isClaudeHarnessReady(current);
  const cursorReady = isCursorHarnessReady(current);

  if (!claudeReady && !cursorReady) {
    return NextResponse.json(
      { error: "At least one harness must be ready before completing setup." },
      { status: 400 },
    );
  }

  const next = completeOnboarding({
    claudeReady,
    cursorReady,
    deferredCursor: body.deferredCursor === true,
  });
  writeSettings(next);

  return NextResponse.json(buildOnboardingStatus(next));
}
