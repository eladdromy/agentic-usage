import { NextResponse } from "next/server";

import {
  isTraceIndexingEnabled,
  readSettings,
  resolveTraceMode,
} from "@/lib/profile/settings";
import { anonymizeTraceProjects, deepScrubReadmePayload } from "@/lib/demo/anonymize-api-payloads";
import { mergeTraceProjects } from "@/lib/tracing/projects-merge";

export const runtime = "nodejs";

export async function GET() {
  const settings = readSettings();
  const activeHarness = settings.activeHarness ?? "claude";

  return NextResponse.json(
    deepScrubReadmePayload({
      projects: anonymizeTraceProjects(mergeTraceProjects(activeHarness)),
      traceMode: {
        claude: resolveTraceMode("claude", settings),
        cursor: resolveTraceMode("cursor", settings),
      },
      indexingEnabled: isTraceIndexingEnabled(activeHarness, settings),
    }),
  );
}
