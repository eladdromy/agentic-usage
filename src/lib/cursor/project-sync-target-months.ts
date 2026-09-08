import { billingMonthsInDayRange } from "@/lib/cursor/billing-coverage-shared";
import type { ProjectSyncMonthInfo } from "@/lib/cursor/project-sync-types";

export type ProjectSyncTargetOptions = {
  months?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyPending?: boolean;
  retryUnmatched?: boolean;
};

export function monthNeedsProjectSync(
  info: Pick<ProjectSyncMonthInfo, "pendingRows" | "unmatchedRows">,
  options: ProjectSyncTargetOptions,
): boolean {
  const onlyPending = options.onlyPending !== false;
  const retryUnmatched = options.retryUnmatched === true;
  return (
    !onlyPending ||
    info.pendingRows > 0 ||
    (retryUnmatched && info.unmatchedRows > 0)
  );
}

/** Rows this sync pass will attempt to match for a month. */
export function rowsToMatchForMonth(
  info: Pick<ProjectSyncMonthInfo, "pendingRows" | "unmatchedRows">,
  options: ProjectSyncTargetOptions,
): number {
  if (options.retryUnmatched) {
    return info.pendingRows + info.unmatchedRows;
  }
  return info.pendingRows;
}

export function resolveProjectSyncTargetMonths(
  options: ProjectSyncTargetOptions,
  monthInfos: ProjectSyncMonthInfo[],
): string[] {
  const availableMonths = monthInfos.map((row) => row.month);

  let months: string[];
  if (options.months?.length) {
    months = options.months.filter((month) => availableMonths.includes(month));
  } else if (options.dateFrom && options.dateTo) {
    months = billingMonthsInDayRange(options.dateFrom, options.dateTo).filter((month) =>
      availableMonths.includes(month),
    );
  } else {
    months = availableMonths;
  }

  // Re-match / Sync now (no upload date span): only months with rows to process.
  if (!options.months?.length && !(options.dateFrom && options.dateTo)) {
    months = months.filter((month) => {
      const info = monthInfos.find((row) => row.month === month);
      return info != null && monthNeedsProjectSync(info, options);
    });
  }

  return months;
}
