export type ProjectSyncMonthStatus =
  | "idle"
  | "pending"
  | "in_progress"
  | "done"
  | "skipped"
  | "error";

export type ProjectSyncMonthInfo = {
  month: string;
  label: string;
  totalRows: number;
  pendingRows: number;
  matchedRows: number;
  unmatchedRows: number;
};

export type ProjectSyncMonthState = ProjectSyncMonthInfo & {
  status: ProjectSyncMonthStatus;
  matched?: number;
  unmatched?: number;
  /** Rows processed so far while status is in_progress. */
  processedRows?: number;
  /** Rows this pass will attempt (pending + unmatched on re-match). */
  rowsToMatch?: number;
  error?: string;
};

export type ProjectSyncPhase = "preparing" | "syncing" | "done";

export type ProjectSyncPreparingStep =
  | "bubble_index"
  | "workspace_scan"
  | "loading_prompts";

export type ProjectSyncMonthsPayload = {
  vscdbAvailable: boolean;
  bubbleIndexReady: boolean;
  months: ProjectSyncMonthInfo[];
};

export type ProjectSyncBackgroundJob = {
  id: string;
  status: "running" | "done" | "error";
  phase: ProjectSyncPhase;
  preparingStep?: ProjectSyncPreparingStep;
  bubbleIndexReady: boolean;
  months: ProjectSyncMonthState[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

export type ProjectAttachMonthResult = {
  month: string;
  label: string;
  scanned: number;
  matched: number;
  skippedCsvProject: number;
  unmatched: number;
  vscdbAvailable: boolean;
};
