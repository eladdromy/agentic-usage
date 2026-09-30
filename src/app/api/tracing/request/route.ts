import { NextResponse } from "next/server";

import { deepScrubReadmePayload } from "@/lib/demo/anonymize-api-payloads";
import { getCursorRequestBreakdown } from "@/lib/db/cursor-trace-db";
import { getRequestBreakdown } from "@/lib/db/trace-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestId = Number.parseInt(url.searchParams.get("requestId") ?? "", 10);
  const harness = url.searchParams.get("harness") === "cursor" ? "cursor" : "claude";
  if (!Number.isFinite(requestId) || requestId < 1) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }

  const breakdown =
    harness === "cursor"
      ? getCursorRequestBreakdown(requestId)
      : getRequestBreakdown(requestId);
  if (!breakdown) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  return NextResponse.json(deepScrubReadmePayload(breakdown));
}
