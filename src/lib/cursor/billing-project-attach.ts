import { attributeBillingEventToComposer } from "@/lib/cursor/billing-event-attribution";
import { buildSubagentParentProjectIndex } from "@/lib/cursor/cursor-subagent-spawn";
import {
  loadComposerProjectMap,
  resolveComposerProjectPath,
} from "@/lib/cursor/project-attribution";
import { getReadonlyCursorDatabase } from "@/lib/cursor/vscdb";
import type { ProviderUsageParsedRow } from "@/lib/cursor/provider-usage-types";
import {
  isVscdbAvailableForAttribution,
  loadGlobalBubblesInRange,
  loadTaskV2DispatchBubbles,
  resolveVscdbPathForAttribution,
} from "@/lib/cursor/vscdb-bubbles";
import { formatBillingMonthLabel } from "@/lib/cursor/billing-coverage-shared";
import {
  queryProviderEventsForProjectAttach,
  queryProjectSyncMonths,
  updateProviderEventAttributionFailure,
  updateProviderEventComposerId,
  clearProviderEventUnmatchReason,
  updateProviderEventProjectAttach,
  type DbEventForAttach,
} from "@/lib/cursor/provider-usage-db";

export type ProjectUnmatchReason =
  | "vscdb_not_found"
  | "no_local_prompts"
  | "no_composer_match"
  | "no_project_path";

export type BillingProjectAttachResult = {
  scanned: number;
  matched: number;
  skippedCsvProject: number;
  unmatched: number;
  vscdbAvailable: boolean;
  month?: string;
  label?: string;
};

export type UnmatchedBillingRow = {
  id: number;
  dateIso: string;
  kind: string;
  model: string;
  cost: string;
  reason: ProjectUnmatchReason;
  reasonLabel: string;
};

const REASON_LABELS: Record<ProjectUnmatchReason, string> = {
  vscdb_not_found: "Cursor state.vscdb not found",
  no_local_prompts: "No local prompts in billing date range",
  no_composer_match: "No matching composer for this timestamp",
  no_project_path: "Composer has no workspace / project path",
};

export function unmatchReasonLabel(reason: ProjectUnmatchReason): string {
  return REASON_LABELS[reason];
}

function rowNeedsComposerAttach(row: DbEventForAttach): boolean {
  return !row.composerId.trim();
}

function rowNeedsProjectAttach(row: DbEventForAttach): boolean {
  return !row.project.trim();
}

function rowNeedsAttach(row: DbEventForAttach): boolean {
  return rowNeedsComposerAttach(row) || rowNeedsProjectAttach(row);
}

export function monthUtcSecBounds(month: string): { fromSec: number; toSec: number } {
  const year = Number(month.slice(0, 4));
  const month0 = Number(month.slice(5, 7)) - 1;
  const fromSec = Math.floor(Date.UTC(year, month0, 1) / 1000);
  const toSec = Math.floor(Date.UTC(year, month0 + 1, 1) / 1000) - 1;
  return { fromSec, toSec };
}

export function buildProjectSyncMonthsPayload(): {
  vscdbAvailable: boolean;
  months: {
    month: string;
    label: string;
    totalRows: number;
    pendingRows: number;
    matchedRows: number;
    unmatchedRows: number;
  }[];
} {
  return {
    vscdbAvailable: isVscdbAvailableForAttribution(),
    months: queryProjectSyncMonths().map((row) => ({
      ...row,
      label: formatBillingMonthLabel(row.month),
    })),
  };
}

function withMonthMeta(
  month: string | undefined,
  result: BillingProjectAttachResult,
): BillingProjectAttachResult {
  return month ? { ...result, month, label: formatBillingMonthLabel(month) } : result;
}

export function attachProjectsToBillingEvents(
  options?: { fromSec?: number; toSec?: number; month?: string },
): BillingProjectAttachResult {
  const month = options?.month?.trim();
  const monthBounds = month ? monthUtcSecBounds(month) : null;
  const queryOptions = month
    ? { month, fromSec: monthBounds!.fromSec, toSec: monthBounds!.toSec }
    : options;

  const events = queryProviderEventsForProjectAttach(queryOptions);
  const needsAttach = events.filter(rowNeedsAttach);
  const skippedCsvProject = events.filter((row) => row.project.trim()).length;

  if (needsAttach.length === 0) {
    return withMonthMeta(month, {
      scanned: events.length,
      matched: 0,
      skippedCsvProject: 0,
      unmatched: 0,
      vscdbAvailable: isVscdbAvailableForAttribution(),
    });
  }

  const vscdbPath = resolveVscdbPathForAttribution();
  const vscdbAvailable = isVscdbAvailableForAttribution();

  if (!vscdbAvailable) {
    for (const row of needsAttach.filter(rowNeedsProjectAttach)) {
      updateProviderEventProjectAttach(row.id, "", "vscdb_not_found");
    }
    return withMonthMeta(month, {
      scanned: events.length,
      matched: 0,
      skippedCsvProject,
      unmatched: needsAttach.filter(rowNeedsProjectAttach).length,
      vscdbAvailable: false,
    });
  }

  const fromSec =
    options?.fromSec ??
    monthBounds?.fromSec ??
    Math.min(...needsAttach.map((r) => r.dateSec)) - 60;
  const toSec =
    options?.toSec ??
    monthBounds?.toSec ??
    Math.max(...needsAttach.map((r) => r.dateSec)) + 60;

  const bubbles = loadGlobalBubblesInRange(fromSec, toSec, vscdbPath);
  const composerProjects = loadComposerProjectMap(vscdbPath);
  const db = getReadonlyCursorDatabase(vscdbPath);
  const taskV2Dispatches = loadTaskV2DispatchBubbles(vscdbPath);
  const subagentParentProjects = buildSubagentParentProjectIndex(
    taskV2Dispatches,
    (parentComposerId) =>
      resolveComposerProjectPath(db, parentComposerId, composerProjects, new Map()),
  );

  let matched = 0;
  let unmatched = 0;

  if (bubbles.length === 0) {
    for (const row of needsAttach.filter(rowNeedsProjectAttach)) {
      updateProviderEventProjectAttach(row.id, "", "no_local_prompts");
      unmatched += 1;
    }
    return withMonthMeta(month, {
      scanned: events.length,
      matched: 0,
      skippedCsvProject,
      unmatched,
      vscdbAvailable: true,
    });
  }

  for (const row of needsAttach) {
    if (row.projectUnmatchReason.trim()) {
      clearProviderEventUnmatchReason(row.id);
    }

    const parsed: Pick<ProviderUsageParsedRow, "date"> = { date: row.dateIso };
    const needsComposer = rowNeedsComposerAttach(row);
    const needsProject = rowNeedsProjectAttach(row);

    let composerId = row.composerId.trim();
    if (needsComposer) {
      composerId = attributeBillingEventToComposer(parsed, bubbles) ?? "";
    }

    if (!composerId) {
      if (needsProject) {
        updateProviderEventProjectAttach(row.id, "", "no_composer_match");
        unmatched += 1;
      } else if (needsComposer) {
        updateProviderEventAttributionFailure(row.id, "no_composer_match");
        unmatched += 1;
      }
      continue;
    }

    if (needsComposer && !needsProject) {
      updateProviderEventComposerId(row.id, composerId);
      matched += 1;
      continue;
    }

    const projectPath = resolveComposerProjectPath(
      db,
      composerId,
      composerProjects,
      subagentParentProjects,
    );
    if (!projectPath) {
      updateProviderEventProjectAttach(row.id, "", "no_project_path", composerId);
      unmatched += 1;
      continue;
    }

    updateProviderEventProjectAttach(row.id, projectPath, null, composerId);
    matched += 1;
  }

  return withMonthMeta(month, {
    scanned: events.length,
    matched,
    skippedCsvProject,
    unmatched,
    vscdbAvailable: true,
  });
}

export function toUnmatchedBillingRow(row: DbEventForAttach & { id: number }): UnmatchedBillingRow | null {
  if (row.project.trim()) return null;
  const reason = (row.projectUnmatchReason ||
    "no_composer_match") as ProjectUnmatchReason;
  return {
    id: row.id,
    dateIso: row.dateIso,
    kind: row.kind,
    model: row.model,
    cost: row.cost,
    reason,
    reasonLabel: unmatchReasonLabel(reason),
  };
}
