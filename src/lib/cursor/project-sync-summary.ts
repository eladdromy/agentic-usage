import type { ProjectSyncMonthState } from "@/lib/cursor/project-sync-types";

/** Short status line for the project sync settings button. */
export function summarizeProjectSyncButton(
  months: ProjectSyncMonthState[],
  options: { syncing?: boolean; loading?: boolean } = {},
): string {
  const { syncing = false, loading = false } = options;

  if (loading) return "Loading…";
  if (syncing) return "Syncing…";
  if (months.length === 0) return "No billing data";

  const failed = months.filter((month) => month.status === "error").length;
  if (failed > 0) {
    return failed === 1 ? "1 month failed" : `${failed} months failed`;
  }

  const monthsBehind = months.filter((month) => month.pendingRows > 0).length;
  if (monthsBehind > 0) {
    return monthsBehind === 1
      ? "1 month behind billing"
      : `${monthsBehind} months behind billing`;
  }

  const inFlight = months.some(
    (month) => month.status === "pending" || month.status === "in_progress",
  );
  if (inFlight) return "Syncing with billing…";

  return "Synced with billing";
}
