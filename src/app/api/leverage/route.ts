import { NextResponse } from "next/server";

import {
  buildPlanLeverageMonthPayload,
  buildPlanLeverageYearPayload,
} from "@/lib/leverage/build-payload";
import { ensureSynced } from "@/lib/db/usage-db";
import { resolveActiveHarness } from "@/lib/profile/settings";
import { currentMonthParam } from "@/lib/timeframe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const harness = resolveActiveHarness();
  if (harness === "claude" || harness === "all") {
    await ensureSynced();
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  if (yearParam != null || monthParam == null) {
    const selectedYear = yearParam
      ? Number.parseInt(yearParam, 10)
      : new Date().getUTCFullYear();
    return NextResponse.json(buildPlanLeverageYearPayload(selectedYear));
  }

  return NextResponse.json(buildPlanLeverageMonthPayload(monthParam ?? currentMonthParam()));
}
