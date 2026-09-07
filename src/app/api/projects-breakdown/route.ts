import { NextResponse } from "next/server";

import { anonymizeProjectBreakdownRows } from "@/lib/demo/anonymize-api-payloads";
import { ensureSynced } from "@/lib/db/usage-db";
import { queryProjectsBreakdown } from "@/lib/projects-breakdown";
import { resolveActiveHarness } from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function GET() {
  const harness = resolveActiveHarness();

  if (harness === "claude" || harness === "all") {
    await ensureSynced();
  }

  const payload = queryProjectsBreakdown(harness);

  return NextResponse.json({
    ...payload,
    rows: anonymizeProjectBreakdownRows(payload.rows),
  });
}
