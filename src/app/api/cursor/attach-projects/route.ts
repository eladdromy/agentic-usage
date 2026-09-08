import { NextResponse } from "next/server";

import {
  attachProjectsToBillingEvents,
  buildProjectSyncMonthsPayload,
  dayUtcSecBounds,
} from "@/lib/cursor/billing-project-attach";

export const runtime = "nodejs";

/** List billing months and how many rows still need project/composer matching. */
export async function GET() {
  try {
    return NextResponse.json(buildProjectSyncMonthsPayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load project sync status";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

/** Match billing rows to local vscdb projects for one month or all months. */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month")?.trim() || undefined;
    const fromDay = url.searchParams.get("from")?.trim() || undefined;
    const toDay = url.searchParams.get("to")?.trim() || undefined;
    const pendingOnly = url.searchParams.get("pendingOnly") === "1";
    const fastPath = url.searchParams.get("fastPath") !== "0";

    const dayBounds =
      fromDay && toDay ? dayUtcSecBounds(fromDay, toDay) : null;

    const result = await attachProjectsToBillingEvents({
      month,
      fromSec: dayBounds?.fromSec,
      toSec: dayBounds?.toSec,
      pendingOnly,
      fastPath,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to attach projects";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
