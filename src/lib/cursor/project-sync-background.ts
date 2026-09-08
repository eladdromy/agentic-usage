import { randomUUID } from "crypto";

import {
  attachProjectsToBillingEvents,
  buildProjectSyncMonthsPayload,
  dayUtcSecBounds,
  monthUtcSecBounds,
} from "@/lib/cursor/billing-project-attach";
import { ensureCursorBubbleIndexSyncAsync } from "@/lib/cursor/cursor-bubble-index";
import { buildSubagentParentProjectIndexAsync } from "@/lib/cursor/cursor-subagent-spawn";
import {
  createBillingAttributionContextAsync,
  type BillingAttributionContext,
  type GlobalBubbleStub,
} from "@/lib/cursor/billing-event-attribution";
import {
  loadComposerProjectMapAsync,
  resolveComposerProjectPath,
} from "@/lib/cursor/project-attribution";
import {
  isVscdbAvailableForAttribution,
  loadGlobalBubblesInRangeAsync,
  loadTaskV2DispatchBubblesAsync,
  resolveVscdbPathForAttribution,
} from "@/lib/cursor/vscdb-bubbles";
import { getReadonlyCursorDatabase } from "@/lib/cursor/vscdb";
import { queryProjectAttachRowBounds } from "@/lib/cursor/provider-usage-db";
import type {
  ProjectSyncBackgroundJob,
  ProjectSyncMonthState,
} from "@/lib/cursor/project-sync-types";
import {
  monthNeedsProjectSync,
  resolveProjectSyncTargetMonths,
  rowsToMatchForMonth,
} from "@/lib/cursor/project-sync-target-months";

export type { ProjectSyncBackgroundJob } from "@/lib/cursor/project-sync-types";

export type StartProjectSyncBackgroundOptions = {
  months?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyPending?: boolean;
  retryUnmatched?: boolean;
};

let activeJob: ProjectSyncBackgroundJob | null = null;

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function monthStateFromInfo(
  info: ProjectSyncMonthState,
  status: ProjectSyncMonthState["status"],
): ProjectSyncMonthState {
  return { ...info, status };
}

function resolveTargetMonths(
  options: StartProjectSyncBackgroundOptions,
  monthInfos: ProjectSyncMonthState[],
): string[] {
  return resolveProjectSyncTargetMonths(options, monthInfos);
}

function buildInitialMonthStates(
  targetMonths: string[],
  monthInfos: ProjectSyncMonthState[],
  options: StartProjectSyncBackgroundOptions,
): ProjectSyncMonthState[] {
  return targetMonths.map((month) => {
    const info = monthInfos.find((row) => row.month === month);
    if (!info) {
      return {
        month,
        label: month,
        totalRows: 0,
        pendingRows: 0,
        matchedRows: 0,
        unmatchedRows: 0,
        status: "skipped" as const,
        rowsToMatch: 0,
      };
    }

    const shouldRun = monthNeedsProjectSync(info, options);
    return {
      ...monthStateFromInfo(info, shouldRun ? "pending" : "skipped"),
      rowsToMatch: shouldRun ? rowsToMatchForMonth(info, options) : 0,
    };
  });
}

function resolveBubblePreloadBounds(
  uploadBounds: { fromSec: number; toSec: number } | null,
  targetMonths: string[],
  pendingOnly: boolean,
): { fromSec: number; toSec: number } | null {
  if (uploadBounds) return uploadBounds;

  const rowBounds = queryProjectAttachRowBounds({
    months: targetMonths,
    pendingOnly,
  });
  if (rowBounds) {
    return {
      fromSec: rowBounds.fromSec - 60,
      toSec: rowBounds.toSec + 60,
    };
  }

  if (targetMonths.length === 0) return null;

  let fromSec = Number.POSITIVE_INFINITY;
  let toSec = Number.NEGATIVE_INFINITY;
  for (const month of targetMonths) {
    const bounds = monthUtcSecBounds(month);
    fromSec = Math.min(fromSec, bounds.fromSec);
    toSec = Math.max(toSec, bounds.toSec);
  }
  return { fromSec, toSec };
}

async function executeProjectSyncJob(
  job: ProjectSyncBackgroundJob,
  options: StartProjectSyncBackgroundOptions,
): Promise<void> {
  try {
    const payload = buildProjectSyncMonthsPayload();
    const monthInfos = payload.months.map((info) =>
      monthStateFromInfo({ ...info, status: "idle" }, "idle"),
    );
    const targetMonths = resolveTargetMonths(options, monthInfos);
    const retryUnmatched = options.retryUnmatched === true;
    const scopedToUpload = Boolean(options.dateFrom && options.dateTo);
    const pendingOnlyForBounds = scopedToUpload && !retryUnmatched;
    const uploadBounds =
      scopedToUpload && options.dateFrom && options.dateTo
        ? dayUtcSecBounds(options.dateFrom, options.dateTo)
        : null;

    let composerProjects: Map<string, string> | undefined;
    let subagentParentProjects: Map<string, string> | undefined;
    let taskV2Dispatches:
      | Awaited<ReturnType<typeof loadTaskV2DispatchBubblesAsync>>
      | undefined;
    let preloadedBubbles: GlobalBubbleStub[] | undefined;
    let billingAttributionContext: BillingAttributionContext | null | undefined;

    job.phase = "preparing";
    await yieldEventLoop();

    if (isVscdbAvailableForAttribution()) {
      const vscdbPath = resolveVscdbPathForAttribution();
      await yieldEventLoop();

      if (!job.bubbleIndexReady) {
        job.preparingStep = "bubble_index";
        await yieldEventLoop();
        await ensureCursorBubbleIndexSyncAsync(vscdbPath);
      }

      job.preparingStep = "workspace_scan";
      await yieldEventLoop();
      composerProjects = await loadComposerProjectMapAsync(vscdbPath, {
        scanWorkspaces: true,
      });

      const bubbleBounds = resolveBubblePreloadBounds(
        uploadBounds,
        targetMonths,
        pendingOnlyForBounds,
      );
      if (bubbleBounds) {
        job.preparingStep = "loading_prompts";
        await yieldEventLoop();
        preloadedBubbles = await loadGlobalBubblesInRangeAsync(
          bubbleBounds.fromSec,
          bubbleBounds.toSec,
          vscdbPath,
          { fastPath: !retryUnmatched },
        );

        if (retryUnmatched) {
          await yieldEventLoop();
          taskV2Dispatches = await loadTaskV2DispatchBubblesAsync(vscdbPath, {
            fromSec: bubbleBounds.fromSec,
            toSec: bubbleBounds.toSec,
          });
          await yieldEventLoop();
          const db = getReadonlyCursorDatabase(vscdbPath);
          subagentParentProjects = await buildSubagentParentProjectIndexAsync(
            taskV2Dispatches,
            (parentComposerId) =>
              resolveComposerProjectPath(
                db,
                parentComposerId,
                composerProjects!,
                new Map(),
              ),
          );
        }

        billingAttributionContext = await createBillingAttributionContextAsync(
          preloadedBubbles,
        );
      }

      await yieldEventLoop();
    }

    job.preparingStep = undefined;
    job.phase = "syncing";
    await yieldEventLoop();

    for (const month of targetMonths) {
      const index = job.months.findIndex((row) => row.month === month);
      if (index < 0) continue;

      const info = monthInfos.find((row) => row.month === month);
      if (!info) continue;

      if (!monthNeedsProjectSync(info, options)) {
        job.months[index] = {
          ...monthStateFromInfo(info, "skipped"),
          rowsToMatch: 0,
        };
        await yieldEventLoop();
        continue;
      }

      job.months[index] = {
        ...monthStateFromInfo(info, "pending"),
        rowsToMatch: rowsToMatchForMonth(info, options),
      };
      await yieldEventLoop();

      try {
        const result = await attachProjectsToBillingEvents({
          month,
          fromSec: uploadBounds?.fromSec,
          toSec: uploadBounds?.toSec,
          pendingOnly: scopedToUpload && !retryUnmatched,
          fastPath: !retryUnmatched,
          composerProjects,
          taskV2Dispatches,
          preloadedBubbles,
          billingAttributionContext,
          subagentParentProjects,
          onProgress: (progress) => {
            job.months[index] = {
              ...job.months[index]!,
              status: "in_progress",
              processedRows: progress.processed,
              matched: progress.matched,
              unmatched: progress.unmatched,
            };
          },
        });

        job.months[index] = {
          ...info,
          status: "done",
          matched: result.matched,
          unmatched: result.unmatched,
        };
      } catch (error) {
        job.months[index] = {
          ...info,
          status: "error",
          error: error instanceof Error ? error.message : "Sync failed",
        };
      }

      await yieldEventLoop();
    }

    job.status = job.months.some((month) => month.status === "error")
      ? "error"
      : "done";
    if (job.status === "error" && !job.error) {
      job.error = "Some billing months failed to sync";
    }
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "Project sync failed";
  } finally {
    job.preparingStep = undefined;
    job.phase = "done";
    job.finishedAt = Date.now();
  }
}

export function getActiveProjectSyncJob(): ProjectSyncBackgroundJob | null {
  if (!activeJob || activeJob.status !== "running") {
    return null;
  }
  return activeJob;
}

/**
 * Latest job regardless of status, retained until the next sync replaces it.
 * The background job can finish faster than one client poll interval, so the
 * completed job must stay readable — otherwise the poller never observes the
 * final per-month result (matched / unmatched) and hangs on stale progress.
 */
export function getLatestProjectSyncJob(): ProjectSyncBackgroundJob | null {
  return activeJob;
}

export function startProjectSyncBackground(
  options: StartProjectSyncBackgroundOptions = {},
): ProjectSyncBackgroundJob {
  if (activeJob?.status === "running") {
    return activeJob;
  }

  const payload = buildProjectSyncMonthsPayload();
  const monthInfos = payload.months.map((info) =>
    monthStateFromInfo({ ...info, status: "idle" }, "idle"),
  );
  const targetMonths = resolveTargetMonths(options, monthInfos);

  const job: ProjectSyncBackgroundJob = {
    id: randomUUID(),
    status: "running",
    phase: "preparing",
    preparingStep: payload.bubbleIndexReady ? "workspace_scan" : "bubble_index",
    bubbleIndexReady: payload.bubbleIndexReady,
    months: buildInitialMonthStates(targetMonths, monthInfos, options),
    startedAt: Date.now(),
  };

  activeJob = job;
  void executeProjectSyncJob(job, options);

  return job;
}
