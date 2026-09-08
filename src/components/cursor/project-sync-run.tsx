"use client";

import { toast } from "sonner";

import { ProjectSyncProgressToast } from "@/components/cursor/project-sync-progress-toast";
import { billingMonthsInDayRange } from "@/lib/cursor/billing-coverage-shared";
import {
  fetchProjectSyncMonths,
  runProjectSyncByMonth,
} from "@/lib/cursor/project-sync-client";
import type { ProjectSyncMonthState } from "@/lib/cursor/project-sync-types";

const TOAST_ID = "project-sync-run";

export type ProjectSyncRunOptions = {
  months?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  retryUnmatched?: boolean;
  onlyPending?: boolean;
  onSyncingChange?: (syncing: boolean) => void;
  onComplete?: () => void;
};

let activeRun: Promise<void> | null = null;

function resolveTargetMonths(
  options: ProjectSyncRunOptions,
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

function renderProgressToast(months: ProjectSyncMonthState[], finished: boolean) {
  toast.custom(() => <ProjectSyncProgressToast months={months} finished={finished} />, {
    id: TOAST_ID,
    duration: finished ? 6000 : Infinity,
    position: "bottom-right",
    className:
      "!w-auto !max-w-[min(20rem,calc(100vw-2rem))] !overflow-hidden !bg-transparent !border-0 !p-0 !shadow-none",
  });
}

export function startProjectSyncRun(options: ProjectSyncRunOptions = {}): Promise<void> {
  if (activeRun) return activeRun;

  activeRun = (async () => {
    options.onSyncingChange?.(true);

    try {
      const payload = await fetchProjectSyncMonths();
      const availableMonths = payload.months.map((month) => month.month);
      const targetMonths = resolveTargetMonths(options, availableMonths);

      if (targetMonths.length === 0) {
        toast.dismiss(TOAST_ID);
        return;
      }

      let monthsState: ProjectSyncMonthState[] = targetMonths.map((month) => {
        const info = payload.months.find((row) => row.month === month)!;
        const shouldRun =
          options.onlyPending === false ||
          info.pendingRows > 0 ||
          (options.retryUnmatched === true && info.unmatchedRows > 0);

        return {
          ...info,
          status: shouldRun ? ("pending" as const) : ("skipped" as const),
        };
      });

      const hasWork = monthsState.some((month) => month.status === "pending");
      if (!hasWork) {
        toast.success("Projects already synced");
        options.onComplete?.();
        return;
      }

      renderProgressToast(monthsState, false);

      await runProjectSyncByMonth({
        months: targetMonths,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        onlyPending: options.onlyPending !== false,
        retryUnmatched: options.retryUnmatched === true,
        onMonthChange: (month, state) => {
          monthsState = monthsState.map((row) =>
            row.month === month ? state : row,
          );
          const finished = !monthsState.some(
            (row) => row.status === "pending" || row.status === "in_progress",
          );
          renderProgressToast(monthsState, finished);
        },
      });

      const failed = monthsState.some((month) => month.status === "error");
      if (failed) {
        toast.error("Some billing months failed to sync.", { id: `${TOAST_ID}-result` });
      }

      options.onComplete?.();
    } catch (error) {
      toast.dismiss(TOAST_ID);
      toast.error(error instanceof Error ? error.message : "Project sync failed");
    } finally {
      options.onSyncingChange?.(false);
      activeRun = null;
    }
  })();

  return activeRun;
}
