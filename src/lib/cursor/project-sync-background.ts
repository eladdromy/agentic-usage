import { randomUUID } from "crypto";

import {
  attachProjectsToBillingEvents,
  buildProjectSyncMonthsPayload,
  dayUtcSecBounds,
} from "@/lib/cursor/billing-project-attach";
import { ensureCursorBubbleIndexSync } from "@/lib/cursor/cursor-bubble-index";
import { loadComposerProjectMap } from "@/lib/cursor/project-attribution";
import {
  isVscdbAvailableForAttribution,
  loadTaskV2DispatchBubbles,
  resolveVscdbPathForAttribution,
} from "@/lib/cursor/vscdb-bubbles";
import { billingMonthsInDayRange } from "@/lib/cursor/billing-coverage-shared";
import type { ProjectSyncMonthState } from "@/lib/cursor/project-sync-types";

export type ProjectSyncBackgroundJob = {
  id: string;
  status: "running" | "done" | "error";
  months: ProjectSyncMonthState[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

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
  availableMonths: string[],
): string[] {
  if (options.months?.length) {
    return options.months.filter((month) => availableMonths.includes(month));
  }
  if (options.dateFrom && options.dateTo) {
    return billingMonthsInDayRange(options.dateFrom, options.dateTo).filter((month) =>
      availableMonths.includes(month),
    );
  }
  return availableMonths;
}

function buildInitialMonthStates(
  targetMonths: string[],
  monthInfos: ProjectSyncMonthState[],
  options: StartProjectSyncBackgroundOptions,
): ProjectSyncMonthState[] {
  const onlyPending = options.onlyPending !== false;
  const retryUnmatched = options.retryUnmatched === true;

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
      };
    }

    const shouldRun =
      !onlyPending ||
      info.pendingRows > 0 ||
      (retryUnmatched && info.unmatchedRows > 0);

    return monthStateFromInfo(info, shouldRun ? "pending" : "skipped");
  });
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
    const availableMonths = monthInfos.map((row) => row.month);
    const targetMonths = resolveTargetMonths(options, availableMonths);
    const onlyPending = options.onlyPending !== false;
    const retryUnmatched = options.retryUnmatched === true;
    const scopedToUpload = Boolean(options.dateFrom && options.dateTo);
    const uploadBounds =
      scopedToUpload && options.dateFrom && options.dateTo
        ? dayUtcSecBounds(options.dateFrom, options.dateTo)
        : null;

    let composerProjects: Map<string, string> | undefined;
    let taskV2Dispatches:
      | ReturnType<typeof loadTaskV2DispatchBubbles>
      | undefined;

    if (isVscdbAvailableForAttribution()) {
      const vscdbPath = resolveVscdbPathForAttribution();
      await yieldEventLoop();
      ensureCursorBubbleIndexSync(vscdbPath);
      composerProjects = loadComposerProjectMap(vscdbPath, { scanWorkspaces: true });
      if (retryUnmatched && uploadBounds) {
        taskV2Dispatches = loadTaskV2DispatchBubbles(vscdbPath, {
          fromSec: uploadBounds.fromSec,
          toSec: uploadBounds.toSec,
        });
      }
      await yieldEventLoop();
    }

    for (const month of targetMonths) {
      const index = job.months.findIndex((row) => row.month === month);
      if (index < 0) continue;

      const info = monthInfos.find((row) => row.month === month);
      if (!info) continue;

      const shouldSkip =
        onlyPending &&
        info.pendingRows === 0 &&
        !(retryUnmatched && info.unmatchedRows > 0);

      if (shouldSkip) {
        job.months[index] = monthStateFromInfo(info, "skipped");
        continue;
      }

      job.months[index] = monthStateFromInfo(info, "in_progress");
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
    job.finishedAt = Date.now();
  }
}

export function getActiveProjectSyncJob(): ProjectSyncBackgroundJob | null {
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
  const targetMonths = resolveTargetMonths(
    options,
    monthInfos.map((row) => row.month),
  );

  const job: ProjectSyncBackgroundJob = {
    id: randomUUID(),
    status: "running",
    months: buildInitialMonthStates(targetMonths, monthInfos, options),
    startedAt: Date.now(),
  };

  activeJob = job;
  void executeProjectSyncJob(job, options);

  return job;
}
