import { NextResponse } from "next/server";

import {
  getLatestProjectSyncJob,
  startProjectSyncBackground,
  type StartProjectSyncBackgroundOptions,
} from "@/lib/cursor/project-sync-background";

export const runtime = "nodejs";

/**
 * Poll background project sync progress (non-blocking for navigation).
 * Returns the latest job even once it has finished so a client that polls
 * slower than the job runs can still read the final per-month result.
 */
export async function GET() {
  const job = getLatestProjectSyncJob();
  if (!job) {
    return NextResponse.json({ status: "idle" as const });
  }
  return NextResponse.json(job);
}

/** Start project sync in the background; returns immediately with job state. */
export async function POST(request: Request) {
  try {
    let options: StartProjectSyncBackgroundOptions = {};
    try {
      const body = (await request.json()) as StartProjectSyncBackgroundOptions;
      if (body && typeof body === "object") {
        options = body;
      }
    } catch {
      // Empty body is fine — sync all pending months.
    }

    const job = startProjectSyncBackground(options);
    return NextResponse.json(job, { status: 202 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start project sync";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
