import { queryCursorTraceSessions } from "@/lib/db/cursor-trace-db";
import { queryTraceSessions, type TraceSessionSort } from "@/lib/db/trace-db";
import type { ActiveHarness } from "@/lib/profile/settings";
import type { TraceHarness, TraceSession } from "@/lib/tracing-shared";

export function queryMergedTraceSessions(options: {
  activeHarness: ActiveHarness;
  projectPath: string;
  claudeProjectSlug: string | null;
  search?: string;
  sort?: TraceSessionSort;
  offset: number;
  limit: number;
}): { rows: TraceSession[]; total: number } {
  const claudeRows =
    options.activeHarness === "cursor"
      ? { rows: [], total: 0 }
      : queryTraceSessions({
          projectPath: options.projectPath,
          projectSlug: options.claudeProjectSlug ?? undefined,
          search: options.search,
          sort: options.sort,
          offset: 0,
          limit: 10_000,
        });

  const cursorRows =
    options.activeHarness === "claude"
      ? { rows: [], total: 0 }
      : queryCursorTraceSessions({
          projectPath: options.projectPath,
          search: options.search,
          sort: options.sort,
          offset: 0,
          limit: 10_000,
        });

  const merged: TraceSession[] = [
    ...claudeRows.rows.map((r) => ({
      harness: "claude" as TraceHarness,
      sessionId: r.sessionId,
      sessionName: r.sessionName,
      interactionCount: r.interactionCount,
      requestCount: r.requestCount,
      userRequestCount: r.userRequestCount,
      modelLabel: r.modelLabel,
      costUsd: r.costUsd,
      startedSec: r.startedSec,
      lastRequestSec: r.lastRequestSec,
    })),
    ...cursorRows.rows.map((r) => ({
      harness: "cursor" as TraceHarness,
      sessionId: r.composerId,
      sessionName: r.sessionName,
      interactionCount: r.interactionCount,
      requestCount: r.requestCount,
      userRequestCount: r.userRequestCount,
      modelLabel: r.modelLabel,
      costUsd: r.costUsd,
      startedSec: r.startedSec,
      lastRequestSec: r.lastRequestSec,
    })),
  ];

  const sort = options.sort ?? "last_request";
  merged.sort((a, b) => {
    if (sort === "most_requests") {
      return b.requestCount - a.requestCount;
    }
    if (sort === "created") {
      return (b.startedSec ?? 0) - (a.startedSec ?? 0);
    }
    return (b.lastRequestSec ?? 0) - (a.lastRequestSec ?? 0);
  });

  const total = merged.length;
  const rows = merged.slice(options.offset, options.offset + options.limit);
  return { rows, total };
}
