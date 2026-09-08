import {
  attributeBillingEventWithContext,
  createBillingAttributionContext,
  createBillingAttributionContextAsync,
  type BillingAttributionContext,
  type GlobalBubbleStub,
} from "@/lib/cursor/billing-event-attribution";
import { buildSubagentParentProjectIndexAsync } from "@/lib/cursor/cursor-subagent-spawn";
import {
  loadComposerProjectMap,
  resolveComposerProjectPath,
} from "@/lib/cursor/project-attribution";
import { getReadonlyCursorDatabase } from "@/lib/cursor/vscdb";
import type { ProviderUsageParsedRow } from "@/lib/cursor/provider-usage-types";
import { isCursorBubbleIndexReady } from "@/lib/cursor/cursor-bubble-index";
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
const ATTACH_YIELD_EVERY = 10;
const ATTACH_PROGRESS_EVERY = 1;

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
  bubbleIndexReady: boolean;
  months: {
    month: string;
    label: string;
    totalRows: number;
    pendingRows: number;
    matchedRows: number;
    unmatchedRows: number;
  }[];
} {
  const vscdbAvailable = isVscdbAvailableForAttribution();
  const vscdbPath = vscdbAvailable ? resolveVscdbPathForAttribution() : null;

  return {
    vscdbAvailable,
    bubbleIndexReady: vscdbPath ? isCursorBubbleIndexReady(vscdbPath) : false,
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

async function filterPreloadedBubblesAsync(
  preloaded: GlobalBubbleStub[],
  roughFrom: number,
  roughTo: number,
): Promise<GlobalBubbleStub[]> {
  const out: GlobalBubbleStub[] = [];
  for (let index = 0; index < preloaded.length; index++) {
    const bubble = preloaded[index]!;
    if (bubble.createdAtSec >= roughFrom && bubble.createdAtSec <= roughTo) {
      out.push(bubble);
    }
    if ((index + 1) % 10_000 === 0) {
      await yieldEventLoop();
    }
  }
  return out;
}

function unmatchReasonFromUpdate(
  update: ProjectAttachBatchUpdate,
): ProjectUnmatchReason | null {
  if (update.type === "failure") {
    return update.reason as ProjectUnmatchReason;
  }
  if (update.type === "project" && update.unmatchReason) {
    return update.unmatchReason as ProjectUnmatchReason;
  }
  return null;
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
    preloadedBubbles?: GlobalBubbleStub[];
    billingAttributionContext?: BillingAttributionContext | null;
    subagentParentProjects?: Map<string, string>;
    onProgress?: (progress: {
      processed: number;
      total: number;
      matched: number;
      unmatched: number;
    }) => void;
  },
): Promise<BillingProjectAttachResult> {
  await yieldEventLoop();

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

  let matched = 0;
  let unmatched = 0;

  const reportProgress = async (processed: number) => {
    options?.onProgress?.({
      processed,
      total: needsAttach.length,
      matched,
      unmatched,
    });
    await yieldEventLoop();
  };

  const hasPreparedAttribution = options?.billingAttributionContext !== undefined;

  let attributionCtx: BillingAttributionContext | null;
  if (hasPreparedAttribution) {
    attributionCtx = options!.billingAttributionContext ?? null;
    await yieldEventLoop();
  } else {
    await yieldEventLoop();

    const roughFrom = Math.floor(bubbleFromSec);
    const roughTo = Math.ceil(bubbleToSec);
    const bubbles =
      options?.preloadedBubbles != null
        ? await filterPreloadedBubblesAsync(
            options.preloadedBubbles,
            roughFrom,
            roughTo,
          )
        : loadGlobalBubblesInRange(bubbleFromSec, bubbleToSec, vscdbPath, {
            fastPath: fastBubblePath,
          });

    await yieldEventLoop();

    attributionCtx = await createBillingAttributionContextAsync(bubbles);
  }

  const composerProjects =
    options?.composerProjects ??
    loadComposerProjectMap(vscdbPath, { scanWorkspaces: true });
  const db = getReadonlyCursorDatabase(vscdbPath);
  const taskV2Dispatches =
    options?.taskV2Dispatches ??
    (fastBubblePath
      ? []
      : loadTaskV2DispatchBubbles(vscdbPath, {
          fromSec: bubbleFromSec,
          toSec: bubbleToSec,
        }));
  await yieldEventLoop();

  const subagentParentProjects =
    options?.subagentParentProjects ??
    (await buildSubagentParentProjectIndexAsync(taskV2Dispatches, (parentComposerId) =>
      resolveComposerProjectPath(db, parentComposerId, composerProjects, new Map()),
    ));

  await yieldEventLoop();

  if (!attributionCtx) {
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
    unmatched = needsAttach.filter(rowNeedsProjectAttach).length;
    await reportProgress(needsAttach.length);
    return withMonthMeta(month, {
      scanned: events.length,
      matched: 0,
      skippedCsvProject,
      unmatched: needsAttach.filter(rowNeedsProjectAttach).length,
      vscdbAvailable: true,
    });
  }

  await reportProgress(0);

  let pendingBatch: ProjectAttachBatchUpdate[] = [];

  const flushBatch = async (forceYield: boolean) => {
    if (pendingBatch.length === 0) return;
    applyProjectAttachBatch(pendingBatch);
    pendingBatch = [];
    if (forceYield) await yieldEventLoop();
  };

  for (let index = 0; index < needsAttach.length; index++) {
    const row = needsAttach[index]!;
    const priorReason = row.projectUnmatchReason.trim() as ProjectUnmatchReason | "";

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
    if (outcome.matched) matched += 1;
    if (outcome.unmatched) unmatched += 1;

    const nextReason = unmatchReasonFromUpdate(outcome.update);
    const unchangedRetryFailure =
      priorReason !== "" &&
      outcome.unmatched &&
      nextReason === priorReason;

    if (!unchangedRetryFailure) {
      const batch: ProjectAttachBatchUpdate[] = [];
      if (priorReason) {
        batch.push({ type: "clear_reason", id: row.id });
      }
      batch.push(outcome.update);
      pendingBatch.push(...batch);
    }

    const atBatchLimit = pendingBatch.length >= ATTACH_BATCH_SIZE;
    const atYieldPoint = (index + 1) % ATTACH_YIELD_EVERY === 0;
    const atProgressPoint =
      (index + 1) % ATTACH_PROGRESS_EVERY === 0 || index === needsAttach.length - 1;
    const isLast = index === needsAttach.length - 1;
    if (atBatchLimit || isLast) {
      await flushBatch(atYieldPoint && !isLast);
    } else if (atProgressPoint) {
      await yieldEventLoop();
    }

    if (atProgressPoint) {
      await reportProgress(index + 1);
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
    preloadedBubbles?: GlobalBubbleStub[];
    billingAttributionContext?: BillingAttributionContext | null;
    subagentParentProjects?: Map<string, string>;
    onProgress?: (progress: {
      processed: number;
      total: number;
      matched: number;
      unmatched: number;
    }) => void;
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
