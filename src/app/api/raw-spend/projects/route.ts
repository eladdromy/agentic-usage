import { NextResponse } from "next/server";

import { ensureSynced } from "@/lib/db/usage-db";
import { rawSpendProjectOptions } from "@/lib/raw-spend-projects";
import { resolveActiveHarness } from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function GET() {
  const harness = resolveActiveHarness();

  if (harness === "claude" || harness === "all") {
    await ensureSynced();
  }

  return NextResponse.json({
    harness,
    projects: rawSpendProjectOptions(harness),
  });
}
