/**
 * Client-safe shared types for the Tracing feature. Kept free of server-only
 * imports (no better-sqlite3) so client components can import them directly.
 */

export type TraceContentPart =
  | { kind: "text"; value: string }
  | { kind: "thinking"; value: string | { encrypted: true; signature: string | null } }
  | { kind: "tool_use"; toolUseId: string | null; name: string; input: unknown }
  | {
      kind: "tool_result";
      toolUseId: string | null;
      content: unknown;
      isError: boolean;
    };

export type TraceHarness = "claude" | "cursor";

export type TraceProject = {
  harnesses: TraceHarness[];
  projectSlug: string;
  projectName: string;
  projectPath: string;
  sessionCount: number;
  requestCount: number;
  lastRequestSec: number | null;
};

export type TraceSession = {
  harness: TraceHarness;
  sessionId: string;
  sessionName: string | null;
  interactionCount: number;
  requestCount: number;
  userRequestCount: number;
  modelLabel: string | null;
  costUsd: number | null;
  startedSec: number | null;
  lastRequestSec: number | null;
};

export type TraceInteractionSummary = {
  idx: number;
  startedSec: number | null;
  endedSec: number | null;
  requestCount: number;
  model: string | null;
  toolSummary: { name: string; count: number }[];
  costUsd: number | null;
  /** Cursor only */
  interactionMode?: string | null;
  reverted?: boolean;
};

export type TraceSessionDetail = {
  harness: TraceHarness;
  session: TraceSession & { projectSlug?: string; projectPath: string };
  interactions: TraceInteractionSummary[];
};

/**
 * A single content part of a request row, matching the HarnOps session-trace
 * model: one DB record explodes into ordered parts (thinking / text / tool /
 * tool_result), each independently selectable.
 */
export type TraceTimelinePartKind =
  | "text"
  | "thinking"
  | "tool"
  | "tool_result"
  | "task"
  | "dispatch";

export type TraceSubagentBranchMeta = {
  label: string;
  model: string | null;
  requestCount: number;
  parts: TraceTimelinePart[];
};

export type TraceTimelinePart = {
  /** Stable per-part id used for selection highlight. */
  timelineId: string;
  /** DB request row id — used to fetch the full breakdown. */
  requestId: number;
  /** Column the part belongs to: "User" prompts vs everything else ("Agent"). */
  role: "User" | "Agent";
  kind: TraceTimelinePartKind;
  /** Display label for compact agent rows (tool name, "thinking", "text", …). */
  kindLabel: string;
  createdSec: number | null;
  /** Prompt/task preview text (user prompt + task-spawn cards only). */
  textPreview: string | null;
  toolUseId: string | null;
  /** Present on `dispatch` parts (Agent tool_use) — the nested subagent branch. */
  subagent: TraceSubagentBranchMeta | null;
};

export type TraceRequestBreakdown = {
  id: number;
  role: "User" | "Agent";
  model: string | null;
  contextPct: number | null;
  content: TraceContentPart[];
  attachedContext?: { category: string; label: string }[];
};

/** Duration between two epoch-seconds, formatted compactly (e.g. 1m 20s). */
export function formatDurationSec(
  startedSec: number | null,
  endedSec: number | null,
): string {
  if (startedSec == null || endedSec == null) return "—";
  const secs = Math.max(0, Math.round(endedSec - startedSec));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

