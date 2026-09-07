import { NextResponse } from "next/server";

import { syncClaudeUsageFromJsonl } from "@/lib/db/usage-db";
import { readSettings, resolveActiveHarness } from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function POST() {
  const settings = readSettings();
  const harness = resolveActiveHarness(settings);

  if (harness === "cursor") {
    return NextResponse.json({
      harness,
      skipped: true,
      skipReason: "csv_only",
      rowsInserted: 0,
      filesScanned: 0,
    });
  }

  const result = await syncClaudeUsageFromJsonl();
  return NextResponse.json({ ...result, harness });
}
