import { NextResponse } from "next/server";

import {
  finalizeCursorTraceSync,
  syncCursorTraceProject,
} from "@/lib/db/cursor-trace-db";
import {
  DEFAULT_TRACE_SYNC_CHUNK,
  finalizeTraceSync,
  syncTraceProject,
} from "@/lib/db/trace-db";
import { DEFAULT_CURSOR_TRACE_SYNC_CHUNK } from "@/lib/db/cursor-trace-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    harness?: unknown;
    projectSlug?: unknown;
    projectPath?: unknown;
    finalize?: unknown;
    finalizeHarness?: unknown;
    limit?: unknown;
  };

  const chunkLimit =
    typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
      ? Math.min(Math.floor(body.limit), 50)
      : undefined;

  if (body.finalize === true) {
    finalizeTraceSync();
    finalizeCursorTraceSync();
    return NextResponse.json({ finalized: true });
  }

  const harness = body.harness === "cursor" ? "cursor" : "claude";

  if (harness === "cursor") {
    if (typeof body.projectPath !== "string" || !body.projectPath.trim()) {
      return NextResponse.json({ error: "projectPath is required" }, { status: 400 });
    }
    const result = syncCursorTraceProject(body.projectPath.trim(), {
      limit: chunkLimit ?? DEFAULT_CURSOR_TRACE_SYNC_CHUNK,
    });
    return NextResponse.json({
      ...result,
      sessionsIndexed: result.composersIndexed,
      done: (result.remainingChanged ?? 0) === 0,
    });
  }

  if (typeof body.projectSlug !== "string" || !body.projectSlug.trim()) {
    return NextResponse.json({ error: "projectSlug is required" }, { status: 400 });
  }

  const result = syncTraceProject(body.projectSlug.trim(), {
    limit: chunkLimit ?? DEFAULT_TRACE_SYNC_CHUNK,
  });
  return NextResponse.json({
    ...result,
    done: (result.remainingChanged ?? 0) === 0,
  });
}
