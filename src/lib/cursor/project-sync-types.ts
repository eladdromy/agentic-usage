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
  error?: string;
};

export type ProjectSyncMonthsPayload = {
  vscdbAvailable: boolean;
  months: ProjectSyncMonthInfo[];
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
