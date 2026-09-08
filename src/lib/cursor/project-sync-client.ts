import type { BillingProjectAttachResult } from "@/lib/cursor/billing-project-attach";
import type {
  ProjectSyncMonthState,
  ProjectSyncMonthsPayload,
} from "@/lib/cursor/project-sync-types";
import type { ProjectSyncBackgroundJob } from "@/lib/cursor/project-sync-background";

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
  onMonthChange: (month: string, state: ProjectSyncMonthState) => void;
}): Promise<void> {
  const existing = await fetchBackgroundSyncJob();
  if (existing?.status === "running") {
    await pollBackgroundSyncJob(existing.id, options.onMonthChange);
    return;
  }

  const job = await startBackgroundSync({
    months: options.months,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    onlyPending: options.onlyPending !== false,
    retryUnmatched: options.retryUnmatched === true,
  });

  for (const month of job.months) {
    options.onMonthChange(month.month, month);
  }

  await pollBackgroundSyncJob(job.id, options.onMonthChange);
}

async function pollBackgroundSyncJob(
  jobId: string,
  onMonthChange: (month: string, state: ProjectSyncMonthState) => void,
): Promise<void> {
  let lastSnapshot = "";

  while (true) {
    const job = await fetchBackgroundSyncJob();
    if (!job || job.id !== jobId) break;

    const snapshot = JSON.stringify(job.months);
    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      for (const month of job.months) {
        onMonthChange(month.month, month);
      }
    }

    if (job.status !== "running") {
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

export function idleProjectSyncMonths(
  payload: ProjectSyncMonthsPayload,
): ProjectSyncMonthState[] {
  return payload.months.map((info) =>
    monthStateFromInfo(info, info.pendingRows === 0 ? "done" : "idle"),
  );
}
