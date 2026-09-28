import { NextResponse } from "next/server";

import {
  isTraceIndexingEnabled,
  readSettings,
  resolveTraceMode,
} from "@/lib/profile/settings";
import { mergeTraceProjects } from "@/lib/tracing/projects-merge";

export const runtime = "nodejs";

export async function GET() {
  const settings = readSettings();
  const activeHarness = settings.activeHarness ?? "claude";

  return NextResponse.json({
    projects: mergeTraceProjects(activeHarness),
    traceMode: {
      claude: resolveTraceMode("claude", settings),
      cursor: resolveTraceMode("cursor", settings),
    },
    indexingEnabled: isTraceIndexingEnabled(activeHarness, settings),
  });
}
