import {
  decodeProjectSlugForDisplay,
  projectNameFromSlug,
} from "@/lib/claude/project-slugs";
import { CURSOR_UNALLOCATED_PATH, queryCursorTraceProjects } from "@/lib/db/cursor-trace-db";
import { queryTraceProjects } from "@/lib/db/trace-db";
import { projectLabelsFromPath } from "@/lib/cursor/project-attribution";
import type { ActiveHarness } from "@/lib/profile/settings";
import type { TraceHarness, TraceProject } from "@/lib/tracing-shared";

function claudeProjects(): TraceProject[] {
  return queryTraceProjects().map((p) => ({
    harnesses: ["claude"] as TraceHarness[],
    projectPath: p.projectPath,
    projectSlug: p.projectSlug,
    projectName: p.projectName,
    sessionCount: p.sessionCount,
    requestCount: p.requestCount,
    lastRequestSec: p.lastRequestSec,
  }));
}

function cursorProjects(): TraceProject[] {
  return queryCursorTraceProjects().map((p) => ({
    harnesses: ["cursor"] as TraceHarness[],
    projectPath: p.projectPath === CURSOR_UNALLOCATED_PATH ? "" : p.projectPath,
    projectSlug: encodeURIComponent(
      p.projectPath === CURSOR_UNALLOCATED_PATH ? CURSOR_UNALLOCATED_PATH : p.projectPath,
    ),
    projectName: p.projectName,
    sessionCount: p.sessionCount,
    requestCount: p.requestCount,
    lastRequestSec: p.lastRequestSec,
  }));
}

export function mergeTraceProjects(activeHarness: ActiveHarness): TraceProject[] {
  if (activeHarness === "claude") return claudeProjects();
  if (activeHarness === "cursor") return cursorProjects();

  const byPath = new Map<string, TraceProject>();

  for (const p of claudeProjects()) {
    const key = p.projectPath.trim() || p.projectSlug;
    byPath.set(key, { ...p });
  }

  for (const p of cursorProjects()) {
    const key = p.projectPath.trim() || p.projectSlug;
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, { ...p });
      continue;
    }
    const harnesses = [...new Set([...existing.harnesses, ...p.harnesses])] as TraceHarness[];
    byPath.set(key, {
      ...existing,
      harnesses,
      sessionCount: existing.sessionCount + p.sessionCount,
      requestCount: existing.requestCount + p.requestCount,
      lastRequestSec:
        existing.lastRequestSec == null
          ? p.lastRequestSec
          : p.lastRequestSec == null
            ? existing.lastRequestSec
            : Math.max(existing.lastRequestSec, p.lastRequestSec),
    });
  }

  return [...byPath.values()].sort((a, b) => {
    const ta = a.lastRequestSec ?? 0;
    const tb = b.lastRequestSec ?? 0;
    return tb - ta;
  });
}

/** Resolve project path from URL segment (encoded path or legacy Claude slug). */
export function resolveTraceProjectPath(segment: string): {
  projectPath: string;
  claudeProjectSlug: string | null;
} {
  const decoded = decodeURIComponent(segment);
  if (decoded.includes("/") || decoded.startsWith("/")) {
    return { projectPath: decoded, claudeProjectSlug: null };
  }
  if (decoded === CURSOR_UNALLOCATED_PATH) {
    return { projectPath: CURSOR_UNALLOCATED_PATH, claudeProjectSlug: null };
  }
  const pathFromSlug = decodeProjectSlugForDisplay(decoded);
  if (pathFromSlug && pathFromSlug !== decoded) {
    return { projectPath: pathFromSlug, claudeProjectSlug: decoded };
  }
  return { projectPath: pathFromSlug || decoded, claudeProjectSlug: decoded };
}

export function projectDisplayName(projectPath: string, claudeSlug: string | null): string {
  if (claudeSlug) return projectNameFromSlug(claudeSlug);
  if (projectPath === CURSOR_UNALLOCATED_PATH) return "Unallocated";
  return projectLabelsFromPath(projectPath).label;
}
