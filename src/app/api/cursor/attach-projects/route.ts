import { NextResponse } from "next/server";

import {
  attachProjectsToBillingEvents,
  buildProjectSyncMonthsPayload,
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
    const month = new URL(request.url).searchParams.get("month")?.trim() || undefined;
    const result = attachProjectsToBillingEvents(month ? { month } : undefined);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to attach projects";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
