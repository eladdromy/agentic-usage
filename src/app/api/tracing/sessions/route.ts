import { NextResponse } from "next/server";

import type { TraceSessionSort } from "@/lib/db/trace-db";
import { readSettings } from "@/lib/profile/settings";
import {
  anonymizeTraceSessionRows,
  anonymizeTraceSessionsMeta,
  deepScrubReadmePayload,
} from "@/lib/demo/anonymize-api-payloads";
import {
  projectDisplayName,
  resolveTraceProjectPath,
} from "@/lib/tracing/projects-merge";
import { queryMergedTraceSessions } from "@/lib/tracing/sessions-query";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;

function resolveSort(value: string | null): TraceSessionSort {
  if (value === "created") return "created";
  if (value === "most_requests") return "most_requests";
  return "last_request";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const segment =
    url.searchParams.get("projectPath")?.trim() ??
    url.searchParams.get("projectSlug")?.trim() ??
    "";
  if (!segment) {
    return NextResponse.json({ error: "projectPath is required" }, { status: 400 });
  }

  const settings = readSettings();
  const activeHarness = settings.activeHarness ?? "claude";
  const { projectPath, claudeProjectSlug } = resolveTraceProjectPath(segment);

  const search = url.searchParams.get("search") ?? undefined;
  const sort = resolveSort(url.searchParams.get("sort"));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_LIMIT;

  const { rows, total } = queryMergedTraceSessions({
    activeHarness,
    projectPath,
    claudeProjectSlug,
    search,
    sort,
    offset,
    limit,
  });

  const projectName = projectDisplayName(projectPath, claudeProjectSlug);
  const meta = anonymizeTraceSessionsMeta(
    projectPath,
    projectName,
    claudeProjectSlug,
  );

  return NextResponse.json(
    deepScrubReadmePayload({
      rows: anonymizeTraceSessionRows(rows, projectPath),
      total,
      offset,
      limit,
      projectPath: meta.projectPath,
      projectName: meta.projectName,
    }),
  );
}
