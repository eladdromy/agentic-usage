"use client";

import { CircleCheck, CircleX, LoaderCircle, Minus } from "lucide-react";

import type { ProjectSyncMonthState } from "@/lib/cursor/project-sync-types";

function MonthStatusIcon({ status }: { status: ProjectSyncMonthState["status"] }) {
  switch (status) {
    case "in_progress":
      return (
        <LoaderCircle size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />
      );
    case "done":
      return (
        <CircleCheck size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      );
    case "skipped":
      return <Minus size={14} className="text-muted-foreground" aria-hidden="true" />;
    case "error":
      return <CircleX size={14} className="text-destructive" aria-hidden="true" />;
    default:
      return (
        <span className="inline-block size-3.5 rounded-full border border-border/80" aria-hidden="true" />
      );
  }
}

function monthStatusLabel(month: ProjectSyncMonthState): string | null {
  if (month.status === "error") return "Failed";
  if (month.status === "in_progress") return "Syncing";
  if (month.status === "done" && month.matched != null) {
    return `${month.matched.toLocaleString()} matched`;
  }
  if (month.status === "skipped") return "Up to date";
  return null;
}

export function ProjectSyncProgressToast({
  months,
  finished,
}: {
  months: ProjectSyncMonthState[];
  finished: boolean;
}) {
  const failed = months.some((month) => month.status === "error");

  return (
    <div className="box-border w-[min(20rem,calc(100vw-2rem))] max-w-full overflow-hidden rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
      <p className="text-sm font-medium">
        {finished
          ? failed
            ? "Project sync finished with errors"
            : "Project sync complete"
          : "Syncing projects…"}
      </p>
      <ul className="mt-2 space-y-1.5">
        {months.map((month) => {
          const statusLabel = monthStatusLabel(month);
          return (
            <li
              key={month.month}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 text-sm"
            >
              <span className="shrink-0">
                <MonthStatusIcon status={month.status} />
              </span>
              <span className="min-w-0 truncate">{month.label}</span>
              {statusLabel ? (
                <span
                  className={
                    month.status === "error"
                      ? "max-w-[5.5rem] truncate text-right text-xs text-destructive"
                      : "max-w-[5.5rem] truncate text-right text-xs text-muted-foreground"
                  }
                >
                  {statusLabel}
                </span>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
