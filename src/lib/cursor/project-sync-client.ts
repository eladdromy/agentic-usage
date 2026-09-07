import type { BillingProjectAttachResult } from "@/lib/cursor/billing-project-attach";
import type {
  ProjectSyncMonthState,
  ProjectSyncMonthsPayload,
} from "@/lib/cursor/project-sync-types";

export async function fetchProjectSyncMonths(): Promise<ProjectSyncMonthsPayload> {
  const res = await fetch("/api/cursor/attach-projects");
  if (!res.ok) throw new Error("Failed to load project sync status");
  return (await res.json()) as ProjectSyncMonthsPayload;
}

export async function attachProjectsForMonth(
  month: string,
): Promise<BillingProjectAttachResult> {
  const res = await fetch(
    `/api/cursor/attach-projects?month=${encodeURIComponent(month)}`,
    { method: "POST" },
  );
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

export async function runProjectSyncByMonth(options: {
  months?: string[];
  /** When false, also re-run months that have unmatched rows from a prior sync. */
  onlyPending?: boolean;
  retryUnmatched?: boolean;
  onMonthChange: (month: string, state: ProjectSyncMonthState) => void;
}): Promise<void> {
  const payload = await fetchProjectSyncMonths();
  const monthInfos = payload.months;
  const targetMonths = options.months ?? monthInfos.map((m) => m.month);
  const onlyPending = options.onlyPending !== false;
  const retryUnmatched = options.retryUnmatched === true;

  for (const month of targetMonths) {
    const info = monthInfos.find((m) => m.month === month);
    if (!info) continue;

    const shouldSkip =
      onlyPending &&
      info.pendingRows === 0 &&
      !(retryUnmatched && info.unmatchedRows > 0);
    if (shouldSkip) {
      options.onMonthChange(month, monthStateFromInfo(info, "skipped"));
      continue;
    }

    options.onMonthChange(month, monthStateFromInfo(info, "in_progress"));

    try {
      const result = await attachProjectsForMonth(month);
      options.onMonthChange(month, {
        ...info,
        status: "done",
        matched: result.matched,
        unmatched: result.unmatched,
      });
    } catch (e) {
      options.onMonthChange(month, {
        ...info,
        status: "error",
        error: e instanceof Error ? e.message : "Sync failed",
      });
    }
  }
}

export function idleProjectSyncMonths(
  payload: ProjectSyncMonthsPayload,
): ProjectSyncMonthState[] {
  return payload.months.map((info) =>
    monthStateFromInfo(info, info.pendingRows === 0 ? "done" : "idle"),
  );
}
