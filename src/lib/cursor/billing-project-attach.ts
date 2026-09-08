import {
  attributeBillingEventWithContext,
  createBillingAttributionContext,
} from "@/lib/cursor/billing-event-attribution";
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
  applyProjectAttachBatch,
  queryProviderEventsForProjectAttach,
  queryProjectSyncMonths,
  type DbEventForAttach,
  type ProjectAttachBatchUpdate,
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

const ATTACH_BATCH_SIZE = 50;
const ATTACH_YIELD_EVERY = 50;

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

export function dayUtcSecBounds(fromDay: string, toDay: string): { fromSec: number; toSec: number } {
  const fromSec = Math.floor(Date.parse(`${fromDay}T00:00:00.000Z`) / 1000);
  const toSec = Math.floor(Date.parse(`${toDay}T23:59:59.999Z`) / 1000);
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

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function planAttachUpdate(
  row: DbEventForAttach,
  composerId: string,
  needsComposer: boolean,
  needsProject: boolean,
  db: ReturnType<typeof getReadonlyCursorDatabase>,
  composerProjects: Map<string, string>,
  subagentParentProjects: Map<string, string>,
): { update: ProjectAttachBatchUpdate; matched: boolean; unmatched: boolean } {
  if (!composerId) {
    if (needsProject) {
      return {
        update: { type: "project", id: row.id, project: "", unmatchReason: "no_composer_match", composerId: "" },
        matched: false,
        unmatched: true,
      };
    }
    return {
      update: { type: "failure", id: row.id, reason: "no_composer_match" },
      matched: false,
      unmatched: true,
    };
  }

  if (needsComposer && !needsProject) {
    return {
      update: { type: "composer", id: row.id, composerId },
      matched: true,
      unmatched: false,
    };
  }

  const projectPath = resolveComposerProjectPath(
    db,
    composerId,
    composerProjects,
    subagentParentProjects,
  );
  if (!projectPath) {
    return {
      update: {
        type: "project",
        id: row.id,
        project: "",
        unmatchReason: "no_project_path",
        composerId,
      },
      matched: false,
      unmatched: true,
    };
  }

  return {
    update: {
      type: "project",
      id: row.id,
      project: projectPath,
      unmatchReason: null,
      composerId,
    },
    matched: true,
    unmatched: false,
  };
}

async function attachProjectsCore(
  options?: {
    fromSec?: number;
    toSec?: number;
    month?: string;
    /** Only rows never matched before (excludes prior failures). */
    pendingOnly?: boolean;
    /** Indexed bubble lookup; does not skip workspace project resolution. */
    fastPath?: boolean;
    composerProjects?: Map<string, string>;
    taskV2Dispatches?: ReturnType<typeof loadTaskV2DispatchBubbles>;
  },
): Promise<BillingProjectAttachResult> {
  const month = options?.month?.trim();
  const monthBounds = month ? monthUtcSecBounds(month) : null;
  const queryFromSec = options?.fromSec ?? monthBounds?.fromSec;
  const queryToSec = options?.toSec ?? monthBounds?.toSec;
  const queryOptions = {
    month,
    fromSec: queryFromSec,
    toSec: queryToSec,
    unattachedOnly: true as const,
    pendingOnly: options?.pendingOnly === true,
  };

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
    applyProjectAttachBatch(
      needsAttach
        .filter(rowNeedsProjectAttach)
        .map((row) => ({
          type: "project" as const,
          id: row.id,
          project: "",
          unmatchReason: "vscdb_not_found",
          composerId: row.composerId.trim(),
        })),
    );
    return withMonthMeta(month, {
      scanned: events.length,
      matched: 0,
      skippedCsvProject,
      unmatched: needsAttach.filter(rowNeedsProjectAttach).length,
      vscdbAvailable: false,
    });
  }

  const eventFromSec = Math.min(...needsAttach.map((r) => r.dateSec)) - 60;
  const eventToSec = Math.max(...needsAttach.map((r) => r.dateSec)) + 60;
  // Bubble lookups follow pending rows in this batch — not the full upload span.
  const bubbleFromSec = eventFromSec;
  const bubbleToSec = eventToSec;
  const fastBubblePath = options?.fastPath !== false;

  const bubbles = loadGlobalBubblesInRange(bubbleFromSec, bubbleToSec, vscdbPath, {
    fastPath: fastBubblePath,
  });
  const attributionCtx = createBillingAttributionContext(bubbles);
  const composerProjects =
    options?.composerProjects ??
    loadComposerProjectMap(vscdbPath, { scanWorkspaces: true });
  const db = getReadonlyCursorDatabase(vscdbPath);
  const taskV2Dispatches = fastBubblePath
    ? (options?.taskV2Dispatches ?? [])
    : loadTaskV2DispatchBubbles(vscdbPath, {
        fromSec: bubbleFromSec,
        toSec: bubbleToSec,
      });
  const subagentParentProjects = buildSubagentParentProjectIndex(
    taskV2Dispatches,
    (parentComposerId) =>
      resolveComposerProjectPath(db, parentComposerId, composerProjects, new Map()),
  );

  let matched = 0;
  let unmatched = 0;

  if (!attributionCtx || bubbles.length === 0) {
    applyProjectAttachBatch(
      needsAttach
        .filter(rowNeedsProjectAttach)
        .map((row) => ({
          type: "project" as const,
          id: row.id,
          project: "",
          unmatchReason: "no_local_prompts",
          composerId: row.composerId.trim(),
        })),
    );
    return withMonthMeta(month, {
      scanned: events.length,
      matched: 0,
      skippedCsvProject,
      unmatched: needsAttach.filter(rowNeedsProjectAttach).length,
      vscdbAvailable: true,
    });
  }

  let pendingBatch: ProjectAttachBatchUpdate[] = [];

  const flushBatch = async (forceYield: boolean) => {
    if (pendingBatch.length === 0) return;
    applyProjectAttachBatch(pendingBatch);
    pendingBatch = [];
    if (forceYield) await yieldEventLoop();
  };

  for (let index = 0; index < needsAttach.length; index++) {
    const row = needsAttach[index]!;
    const batch: ProjectAttachBatchUpdate[] = [];

    if (row.projectUnmatchReason.trim()) {
      batch.push({ type: "clear_reason", id: row.id });
    }

    const parsed: Pick<ProviderUsageParsedRow, "date"> = { date: row.dateIso };
    const needsComposer = rowNeedsComposerAttach(row);
    const needsProject = rowNeedsProjectAttach(row);

    let composerId = row.composerId.trim();
    if (needsComposer && attributionCtx) {
      composerId = attributeBillingEventWithContext(parsed, attributionCtx) ?? "";
    }

    const outcome = planAttachUpdate(
      row,
      composerId,
      needsComposer,
      needsProject,
      db,
      composerProjects,
      subagentParentProjects,
    );
    batch.push(outcome.update);
    if (outcome.matched) matched += 1;
    if (outcome.unmatched) unmatched += 1;

    pendingBatch.push(...batch);

    const atBatchLimit = pendingBatch.length >= ATTACH_BATCH_SIZE;
    const atYieldPoint = (index + 1) % ATTACH_YIELD_EVERY === 0;
    const isLast = index === needsAttach.length - 1;
    if (atBatchLimit || isLast) {
      await flushBatch(atYieldPoint && !isLast);
    }
  }

  return withMonthMeta(month, {
    scanned: events.length,
    matched,
    skippedCsvProject,
    unmatched,
    vscdbAvailable: true,
  });
}

export async function attachProjectsToBillingEvents(
  options?: {
    fromSec?: number;
    toSec?: number;
    month?: string;
    pendingOnly?: boolean;
    fastPath?: boolean;
    composerProjects?: Map<string, string>;
    taskV2Dispatches?: ReturnType<typeof loadTaskV2DispatchBubbles>;
  },
): Promise<BillingProjectAttachResult> {
  return attachProjectsCore(options);
}

/** @deprecated Use attachProjectsToBillingEvents (async). */
export const attachProjectsToBillingEventsAsync = attachProjectsToBillingEvents;

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
