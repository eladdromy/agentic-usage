/**
 * Self-contained Claude-only trace types.
 *
 * Unlike the usage indexer (which only stores token/cost aggregates), the trace
 * layer captures the full interaction/request/tool timeline parsed from Claude
 * Code JSONL session files. These types are intentionally decoupled from the
 * Cursor "composer" model so tracing can evolve independently.
 */

export type SessionAgentKind =
  | "text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "task"
  | null;

/** A thinking block is either raw text or an encrypted signature placeholder. */
export type TraceThinkingValue =
  | string
  | { encrypted: true; signature: string | null };

export type TraceContentPart =
  | { kind: "text"; value: string }
  | { kind: "thinking"; value: TraceThinkingValue }
  | { kind: "tool_use"; toolUseId: string | null; name: string; input: unknown }
  | {
      kind: "tool_result";
      toolUseId: string | null;
      content: unknown;
      isError: boolean;
    };

export interface TraceToolUsage {
  name: string;
  count: number;
}

export interface TraceUsage {
  inputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
}

export interface TraceRequestRow {
  recordUuid: string;
  promptId: string | null;
  messageId: string | null;
  role: "User" | "Agent";
  agentKind: SessionAgentKind;
  toolName: string | null;
  toolUseId: string | null;
  parentToolUseId: string | null;
  /** True for the subagent spawn line (shown nested, not a session user request). */
  isSubagentTask: boolean;
  model: string | null;
  createdSec: number | null;
  /** Context fill % from assistant `message.usage` (request-level only). */
  contextPct: number | null;
  content: TraceContentPart[];
  toolUsage: TraceToolUsage[];
  usage: TraceUsage | null;
  /** Raw `costUSD` from the JSONL record (usually null on subscription usage). */
  costUsd: number | null;
  /** API-equivalent cost derived from token usage + model rate (token pricing). */
  apiCostUsd: number | null;
  /** Nested subagent transcript when this row is an Agent tool_use dispatch. */
  subagentBranch: TraceSubagentBranch | null;
}

export interface TraceSubagentBranch {
  toolUseId: string;
  agentType: string;
  description: string;
  modelLabel: string | null;
  requests: TraceRequestRow[];
}

export interface ParsedSessionFile {
  sessionId: string;
  sessionName: string | null;
  requests: TraceRequestRow[];
  userRequestCount: number;
  agentRequestCount: number;
  startedAtSec: number | null;
  lastRequestAtSec: number | null;
}

/** One grouped turn: a user prompt plus the agent rows that follow it. */
export interface TraceInteraction {
  idx: number;
  startedSec: number | null;
  endedSec: number | null;
  requestCount: number;
  model: string | null;
  toolSummary: TraceToolUsage[];
  costUsd: number | null;
  requests: TraceRequestRow[];
}
