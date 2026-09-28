import { NextResponse } from "next/server";

import { getCursorTraceSession } from "@/lib/db/cursor-trace-db";
import { getTraceSession } from "@/lib/db/trace-db";
import { decodeProjectSlugForDisplay } from "@/lib/claude/project-slugs";
import { isValidSessionId } from "@/lib/claude/trace/session-parse";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  const harness = url.searchParams.get("harness") === "cursor" ? "cursor" : "claude";

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  if (harness === "cursor") {
    const detail = getCursorTraceSession(sessionId);
    if (!detail) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({
      harness: "cursor" as const,
      session: {
        harness: "cursor" as const,
        sessionId: detail.session.composerId,
        sessionName: detail.session.sessionName,
        interactionCount: detail.session.interactionCount,
        requestCount: detail.session.requestCount,
        userRequestCount: detail.session.userRequestCount,
        modelLabel: detail.session.modelLabel,
        costUsd: detail.session.costUsd,
        startedSec: detail.session.startedSec,
        lastRequestSec: detail.session.lastRequestSec,
        projectPath: detail.session.projectPath,
      },
      interactions: detail.interactions.map((i) => ({
        idx: i.idx,
        startedSec: i.startedSec,
        endedSec: i.endedSec,
        requestCount: i.requestCount,
        model: i.model,
        toolSummary: i.toolSummary,
        costUsd: i.costUsd,
        interactionMode: i.interactionMode,
        reverted: i.reverted,
      })),
    });
  }

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const detail = getTraceSession(sessionId);
  if (!detail) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    harness: "claude" as const,
    session: {
      harness: "claude" as const,
      sessionId: detail.session.sessionId,
      sessionName: detail.session.sessionName,
      interactionCount: detail.session.interactionCount,
      requestCount: detail.session.requestCount,
      userRequestCount: detail.session.userRequestCount,
      modelLabel: detail.session.modelLabel,
      costUsd: detail.session.costUsd,
      startedSec: detail.session.startedSec,
      lastRequestSec: detail.session.lastRequestSec,
      projectSlug: detail.session.projectSlug,
      projectPath: decodeProjectSlugForDisplay(detail.session.projectSlug),
    },
    interactions: detail.interactions,
  });
}
