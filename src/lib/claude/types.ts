export type ClaudeCacheCreationUsage = {
  ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
};

export type ClaudeMessageUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
  cache_creation?: ClaudeCacheCreationUsage;
};

export type UsageEventRow = {
  id: number;
  dateIso: string;
  dateSec: number;
  projectSlug: string;
  sessionId: string;
  model: string;
  inputWithoutCacheWrite: number | null;
  inputWithCacheWrite: number | null;
  cacheCreate5m: number | null;
  cacheCreate1h: number | null;
  cacheRead: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  calculatedCostUsd: number | null;
  eventKey: string;
  fileKey: string;
  lineNumber: number;
};

export type SyncResult = {
  filesScanned: number;
  rowsInserted: number;
  durationMs: number;
  /** True when sync did not scan files. */
  skipped?: boolean;
  skipReason?: "debounce" | "no_updates";
  syncMode?: "updates_only" | "full";
};
