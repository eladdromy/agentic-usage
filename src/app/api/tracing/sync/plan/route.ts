import { NextResponse } from "next/server";

import type { ActiveHarness } from "@/lib/profile/settings";
import { isTraceIndexingEnabled, readSettings } from "@/lib/profile/settings";
import { unifiedTraceSyncPlan } from "@/lib/tracing/sync-plan";

export const runtime = "nodejs";

function parsePlanScope(value: string | null): ActiveHarness | null {
  if (value === "claude" || value === "cursor" || value === "all") return value;
  return null;
}

export async function GET(request: Request) {
  const settings = readSettings();
  const activeHarness = settings.activeHarness ?? "claude";
  const scope = parsePlanScope(new URL(request.url).searchParams.get("harness"));
  const plan = unifiedTraceSyncPlan(activeHarness, scope ?? undefined);
  return NextResponse.json({
    ...plan,
    indexingEnabled: isTraceIndexingEnabled(activeHarness, settings),
    scope: scope ?? "all",
  });
}
