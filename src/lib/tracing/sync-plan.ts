import { planCursorTraceSync } from "@/lib/db/cursor-trace-db";
import { planTraceSync } from "@/lib/db/trace-db";
import type { ActiveHarness } from "@/lib/profile/settings";
import { readSettings, resolveTraceMode } from "@/lib/profile/settings";

export type UnifiedTraceSyncProject = {
  harness: "claude" | "cursor";
  projectKey: string;
  projectName: string;
  changedFiles: number;
  totalFiles: number;
};

export function unifiedTraceSyncPlan(
  activeHarness: ActiveHarness,
  scope?: ActiveHarness,
): {
  projects: UnifiedTraceSyncProject[];
  totalChangedFiles: number;
} {
  const settings = readSettings();
  const projects: UnifiedTraceSyncProject[] = [];
  const includeClaude =
    (activeHarness === "claude" || activeHarness === "all") &&
    (scope == null || scope === "claude" || scope === "all");
  const includeCursor =
    (activeHarness === "cursor" || activeHarness === "all") &&
    (scope == null || scope === "cursor" || scope === "all");

  if (
    includeClaude &&
    resolveTraceMode("claude", settings) === "full_tracing"
  ) {
    const claude = planTraceSync();
    for (const p of claude.projects) {
      projects.push({
        harness: "claude",
        projectKey: p.projectSlug,
        projectName: p.projectName,
        changedFiles: p.changedFiles,
        totalFiles: p.totalFiles,
      });
    }
  }

  if (
    includeCursor &&
    resolveTraceMode("cursor", settings) === "full_tracing"
  ) {
    const cursor = planCursorTraceSync();
    for (const p of cursor.projects) {
      projects.push({
        harness: "cursor",
        projectKey: p.projectPath,
        projectName: p.projectName,
        changedFiles: p.changedComposers,
        totalFiles: p.totalComposers,
      });
    }
  }

  return {
    projects,
    totalChangedFiles: projects.reduce((s, p) => s + p.changedFiles, 0),
  };
}
