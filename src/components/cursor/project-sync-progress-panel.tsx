"use client";

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
}: {
  title: string;
  description: string;
  state: "pending" | "active" | "done";
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
      <p className={state === "pending" ? "text-muted-foreground" : "font-medium"}>{title}</p>
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
    // The active step row below already names the current work (with a spinner
    // and description), so keep this header generic to avoid duplicating it.
    return "Preparing local Cursor data…";
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
}: {
  phase: ProjectSyncPhase;
  preparingStep?: ProjectSyncPreparingStep;
  months: ProjectSyncMonthState[];
  finished: boolean;
  bubbleIndexReady?: boolean;
  uploadSummary?: string | null;
}) {
  const failed = months.some((month) => month.status === "error");
  const needsBubbleIndex = !bubbleIndexReady;
  const visiblePrepSteps = PREP_STEP_ORDER.filter(
    (step) => step !== "bubble_index" || needsBubbleIndex,
  );
  const syncStarted = monthSyncStarted(months);
  const activePreparingStep = effectivePreparingStep(phase, preparingStep, months);
  const showPrepSteps = !finished && (phase === "preparing" || (phase === "syncing" && !syncStarted));

  return (
    <div className="space-y-4">
      {uploadSummary ? (
        <p className="text-sm text-muted-foreground">{uploadSummary}</p>
      ) : null}

      <p className="text-sm font-medium">
        {projectSyncProgressTitle({
          finished,
          failed,
          phase,
          preparingStep: activePreparingStep,
          showPrepSteps,
        })}
      </p>

      <ul className="space-y-3" aria-live="polite">
        {showPrepSteps ? (
          <>
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
          </>
        ) : null}

        {!showPrepSteps
          ? months.map((month) => {
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
                          ? "max-w-[7rem] truncate text-right text-xs text-destructive"
                          : "max-w-[7rem] truncate text-right text-xs text-muted-foreground"
                      }
                    >
                      {statusLabel}
                    </span>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </li>
              );
            })
          : null}
      </ul>
    </div>
  );
}
