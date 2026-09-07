import { NextResponse } from "next/server";

import { ensureSynced } from "@/lib/db/usage-db";
import { rawSpendModelOptions } from "@/lib/raw-spend-models";
import { resolveActiveHarness } from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function GET() {
  const harness = resolveActiveHarness();

  if (harness === "claude" || harness === "all") {
    await ensureSynced();
  }

  return NextResponse.json({
    harness,
    models: rawSpendModelOptions(harness),
  });
}
