"use client";

import type { ReactNode } from "react";
import { CircleCheck, CircleX, LoaderCircle, Minus } from "lucide-react";

import type {
  ProjectSyncMonthState,
  ProjectSyncPhase,
  ProjectSyncPreparingStep,
} from "@/lib/cursor/project-sync-types";

const PREP_STEP_ORDER: ProjectSyncPreparingStep[] = [
  "bubble_index",
  "workspace_scan",
  "loading_prompts",
];

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
  if (month.status === "in_progress") {
    const total = month.rowsToMatch ?? month.pendingRows + month.unmatchedRows;
    if (month.processedRows != null && total > 0) {
      return `${month.processedRows.toLocaleString()} / ${total.toLocaleString()}`;
    }
    if (total > 0) {
      return `Matching ${total.toLocaleString()} rows…`;
    }
    return "Matching rows…";
  }
  if (month.status === "done") {
    if (month.matched != null || month.unmatched != null) {
      const parts: string[] = [];
      if (month.matched != null && month.matched > 0) {
        parts.push(`${month.matched.toLocaleString()} matched`);
      }
      if (month.unmatched != null && month.unmatched > 0) {
        parts.push(`${month.unmatched.toLocaleString()} unmatched`);
      }
      if (parts.length > 0) return parts.join(", ");
    }
    return "Done";
  }
  if (month.status === "skipped") return "Up to date";
  if (month.status === "pending") return "Up next";
  return null;
}

function PrepStepRow({
  title,
  description,
  state,
  action,
}: {
  title: string;
  description: string;
  state: "pending" | "active" | "done";
  action?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm">
      <span className="shrink-0">
        {state === "active" ? (
          <LoaderCircle size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />
        ) : state === "done" ? (
          <CircleCheck size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        ) : (
          <span className="inline-block size-3.5 rounded-full border border-border/80" aria-hidden="true" />
        )}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className={state === "pending" ? "text-muted-foreground" : "font-medium"}>{title}</p>
        {action}
      </div>
      {state === "active" ? (
        <p className="col-start-2 min-w-0 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </li>
  );
}

function prepStepState(
  step: ProjectSyncPreparingStep,
  preparingStep: ProjectSyncPreparingStep | undefined,
  visibleSteps: ProjectSyncPreparingStep[],
): "pending" | "active" | "done" {
  if (!visibleSteps.includes(step)) return "done";
  if (!preparingStep) {
    return visibleSteps.indexOf(step) < visibleSteps.length ? "done" : "pending";
  }

  const stepIndex = visibleSteps.indexOf(step);
  const activeIndex = visibleSteps.indexOf(preparingStep);
  if (stepIndex < 0) return "done";
  if (activeIndex < 0) return "pending";
  if (stepIndex < activeIndex) return "done";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

export function ProjectSyncMonthList({
  months,
  className = "space-y-3",
}: {
  months: ProjectSyncMonthState[];
  className?: string;
}) {
  return (
    <ul className={className} aria-live="polite">
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
                    ? "max-w-[8rem] truncate text-right text-xs text-destructive"
                    : "max-w-[8rem] truncate text-right text-xs tabular-nums text-muted-foreground"
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
  );
}

/** True once at least one month is actively matching rows or has finished. */
function monthSyncStarted(months: ProjectSyncMonthState[]): boolean {
  return months.some(
    (month) =>
      month.status === "in_progress" ||
      month.status === "done" ||
      month.status === "error",
  );
}

function effectivePreparingStep(
  phase: ProjectSyncPhase,
  preparingStep: ProjectSyncPreparingStep | undefined,
  months: ProjectSyncMonthState[],
): ProjectSyncPreparingStep | undefined {
  if (phase === "preparing") return preparingStep;
  if (phase === "syncing" && !monthSyncStarted(months)) {
    return "loading_prompts";
  }
  return undefined;
}

export function projectSyncProgressTitle(options: {
  finished: boolean;
  failed: boolean;
  phase: ProjectSyncPhase;
  preparingStep?: ProjectSyncPreparingStep;
  showPrepSteps: boolean;
}): string {
  if (options.finished) {
    return options.failed ? "Project sync finished with errors" : "Project sync complete";
  }
  if (options.showPrepSteps) {
    // Same heading as Claude's spend line. The rows under it are the CSV match.
    return "Indexing spend…";
  }
  return "Matching billing rows…";
}

export function ProjectSyncProgressPanel({
  phase,
  preparingStep,
  months,
  finished,
  bubbleIndexReady = true,
  uploadSummary,
  hideMonthList = false,
  retainPrepSteps = false,
  includeMatchingStep = false,
  matchingStatusAction,
}: {
  phase: ProjectSyncPhase;
  preparingStep?: ProjectSyncPreparingStep;
  months: ProjectSyncMonthState[];
  finished: boolean;
  bubbleIndexReady?: boolean;
  uploadSummary?: string | null;
  /** Keep the month rows off this surface. */
  hideMonthList?: boolean;
  /** Leave the prep checklist on screen after month matching starts. */
  retainPrepSteps?: boolean;
  /** Always show “Matching billing rows” as the last prep bullet. */
  includeMatchingStep?: boolean;
  /** Shown on that bullet while matching has not finished. */
  matchingStatusAction?: ReactNode;
}) {
  const failed = months.some((month) => month.status === "error");
  const needsBubbleIndex = !bubbleIndexReady;
  const visiblePrepSteps = PREP_STEP_ORDER.filter(
    (step) => step !== "bubble_index" || needsBubbleIndex,
  );
  const syncStarted = monthSyncStarted(months);
  const activePreparingStep = effectivePreparingStep(phase, preparingStep, months);
  const showPrepSteps =
    !finished &&
    (retainPrepSteps ||
      phase === "preparing" ||
      (phase === "syncing" && !syncStarted));
  const matchingState: "pending" | "active" | "done" = finished
    ? "done"
    : syncStarted
      ? "active"
      : "pending";
  const title = projectSyncProgressTitle({
    finished,
    failed,
    phase,
    preparingStep: activePreparingStep,
    showPrepSteps,
  });

  return (
    <div className="space-y-4">
      {uploadSummary ? (
        <p className="text-sm text-muted-foreground">{uploadSummary}</p>
      ) : null}

      {finished ? (
        <div className="flex items-center gap-3">
          {failed ? (
            <CircleX size={20} className="shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <CircleCheck
              size={20}
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">
              {failed
                ? "Some billing months could not be matched."
                : "Billing rows are linked to local projects."}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm font-medium">{title}</p>
      )}

      {showPrepSteps ? (
        <ul className="space-y-3" aria-live="polite">
          {needsBubbleIndex ? (
            <PrepStepRow
              title="Loading conversation history"
              description="One-time index of local Cursor prompts. Can take 1–2 minutes on first run."
              state={prepStepState("bubble_index", activePreparingStep, visiblePrepSteps)}
            />
          ) : null}
          <PrepStepRow
            title="Scanning workspace folders"
            description="Reading project paths from Cursor workspace storage."
            state={prepStepState("workspace_scan", activePreparingStep, visiblePrepSteps)}
          />
          <PrepStepRow
            title="Loading prompts for billing rows"
            description="Matching billing timestamps to local Cursor conversations. This often takes the longest."
            state={prepStepState("loading_prompts", activePreparingStep, visiblePrepSteps)}
          />
          {includeMatchingStep ? (
            <PrepStepRow
              title="Matching billing rows"
              description="CSV months are being linked to local projects."
              state={matchingState}
              action={matchingState === "active" ? matchingStatusAction : undefined}
            />
          ) : null}
        </ul>
      ) : hideMonthList ? null : (
        <ProjectSyncMonthList months={months} />
      )}
    </div>
  );
}
