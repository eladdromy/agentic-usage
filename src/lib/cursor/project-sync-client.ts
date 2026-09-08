import type { BillingProjectAttachResult } from "@/lib/cursor/billing-project-attach";
import type {
  ProjectSyncBackgroundJob,
  ProjectSyncMonthState,
  ProjectSyncMonthsPayload,
  ProjectSyncPhase,
  ProjectSyncPreparingStep,
} from "@/lib/cursor/project-sync-types";

export type ProjectSyncJobSnapshot = {
  phase: ProjectSyncPhase;
  preparingStep?: ProjectSyncPreparingStep;
  bubbleIndexReady: boolean;
  months: ProjectSyncMonthState[];
  status: ProjectSyncBackgroundJob["status"];
  finished: boolean;
  error?: string;
};

export async function fetchProjectSyncMonths(): Promise<ProjectSyncMonthsPayload> {
  const res = await fetch("/api/cursor/attach-projects");
  if (!res.ok) throw new Error("Failed to load project sync status");
  return (await res.json()) as ProjectSyncMonthsPayload;
}

export type AttachProjectsOptions = {
  fromDay?: string | null;
  toDay?: string | null;
  pendingOnly?: boolean;
  fastPath?: boolean;
};

/** Single-month attach (blocking). Prefer background sync for multi-month runs. */
export async function attachProjectsForMonth(
  month: string,
  options: AttachProjectsOptions = {},
): Promise<BillingProjectAttachResult> {
  const params = new URLSearchParams({ month });
  if (options.fromDay && options.toDay) {
    params.set("from", options.fromDay);
    params.set("to", options.toDay);
  }
  if (options.pendingOnly) {
    params.set("pendingOnly", "1");
  }
  if (options.fastPath === false) {
    params.set("fastPath", "0");
  }

  const res = await fetch(`/api/cursor/attach-projects?${params.toString()}`, {
    method: "POST",
  });
  const json = (await res.json()) as BillingProjectAttachResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Project sync failed");
  return json;
}

function monthStateFromInfo(
  info: ProjectSyncMonthsPayload["months"][number],
  status: ProjectSyncMonthState["status"],
): ProjectSyncMonthState {
  return { ...info, status };
}

const POLL_INTERVAL_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotFromJob(job: ProjectSyncBackgroundJob): ProjectSyncJobSnapshot {
  return {
    phase: job.phase,
    preparingStep: job.preparingStep,
    bubbleIndexReady: job.bubbleIndexReady,
    months: job.months,
    status: job.status,
    finished: job.status !== "running",
    error: job.error,
  };
}

async function fetchBackgroundSyncJob(): Promise<ProjectSyncBackgroundJob | null> {
  const res = await fetch("/api/cursor/attach-projects/sync");
  if (!res.ok) throw new Error("Failed to load project sync status");
  const json = (await res.json()) as ProjectSyncBackgroundJob | { status: "idle" };
  if ("status" in json && json.status === "idle") return null;
  return json as ProjectSyncBackgroundJob;
}

async function startBackgroundSync(options: {
  months?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyPending?: boolean;
  retryUnmatched?: boolean;
}): Promise<ProjectSyncBackgroundJob> {
  const res = await fetch("/api/cursor/attach-projects/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const json = (await res.json()) as ProjectSyncBackgroundJob & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to start project sync");
  return json;
}

export async function runProjectSyncByMonth(options: {
  months?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  /** When false, also re-run months that have unmatched rows from a prior sync. */
  onlyPending?: boolean;
  retryUnmatched?: boolean;
  onJobChange: (snapshot: ProjectSyncJobSnapshot) => void;
}): Promise<ProjectSyncJobSnapshot> {
  const existing = await fetchBackgroundSyncJob();
  if (existing?.status === "running") {
    return pollBackgroundSyncJob(existing.id, options.onJobChange);
  }

  const job = await startBackgroundSync({
    months: options.months,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    onlyPending: options.onlyPending !== false,
    retryUnmatched: options.retryUnmatched === true,
  });

  options.onJobChange(snapshotFromJob(job));

  return pollBackgroundSyncJob(job.id, options.onJobChange);
}

async function pollBackgroundSyncJob(
  jobId: string,
  onJobChange: (snapshot: ProjectSyncJobSnapshot) => void,
): Promise<ProjectSyncJobSnapshot> {
  let lastSnapshot = "";
  let finalSnapshot: ProjectSyncJobSnapshot = {
    phase: "preparing",
    bubbleIndexReady: true,
    months: [],
    status: "running",
    finished: false,
  };

  while (true) {
    const job = await fetchBackgroundSyncJob();

    if (job?.id === jobId) {
      const snapshot = JSON.stringify({
        phase: job.phase,
        preparingStep: job.preparingStep,
        months: job.months,
        status: job.status,
      });
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        finalSnapshot = snapshotFromJob(job);
        onJobChange(finalSnapshot);
      }

      // The job may finish within a single poll interval; a non-running status
      // is the authoritative final snapshot (real per-month matched/unmatched).
      if (job.status !== "running") {
        break;
      }
    } else {
      // Our job is no longer the latest on the server (superseded by a newer sync).
      // Finalize with the best-known snapshot so the UI never hangs waiting for progress
      // that will never arrive for this job id.
      if (!finalSnapshot.finished) {
        finalSnapshot = {
          ...finalSnapshot,
          phase: "done",
          finished: true,
          status: finalSnapshot.months.some((month) => month.status === "error")
            ? "error"
            : "done",
        };
        onJobChange(finalSnapshot);
      }
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return finalSnapshot;
}

export function idleProjectSyncMonths(
  payload: ProjectSyncMonthsPayload,
): ProjectSyncMonthState[] {
  return payload.months.map((info) =>
    monthStateFromInfo(info, info.pendingRows === 0 ? "done" : "idle"),
  );
}
