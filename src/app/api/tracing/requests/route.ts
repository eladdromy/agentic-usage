import { NextResponse } from "next/server";

import { listCursorInteractionRequests } from "@/lib/db/cursor-trace-db";
import { listInteractionRequests } from "@/lib/db/trace-db";
import { isValidSessionId } from "@/lib/claude/trace/session-parse";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  const harness = url.searchParams.get("harness") === "cursor" ? "cursor" : "claude";
  const interactionIdx = Number.parseInt(
    url.searchParams.get("interaction") ?? "",
    10,
  );
  if (!Number.isFinite(interactionIdx) || interactionIdx < 1) {
    return NextResponse.json({ error: "Invalid interaction" }, { status: 400 });
  }

  if (harness === "cursor") {
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    const items = listCursorInteractionRequests(sessionId, interactionIdx);
    return NextResponse.json({ items });
  }

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const items = listInteractionRequests(sessionId, interactionIdx);
  return NextResponse.json({ items });
}
