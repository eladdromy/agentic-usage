import type { CursorInteractionMode } from "./interaction-mode";

export type CursorTraceContentPart =
  | { kind: "text"; value: string }
  | { kind: "thinking"; value: string }
  | {
      kind: "tool";
      name: string;
      toolCallId: string | null;
      params: unknown;
      result: unknown;
    };

export type CursorAttachedContextEntry = {
  category: string;
  label: string;
};

export type CursorBubbleRow = {
  bubbleKey: string;
  bubbleId: string;
  type: number;
  isSimulatedMsg: boolean;
  createdAtSec: number | null;
  raw: string;
  model: string | null;
  contextPct: number | null;
  preview: string;
  content: CursorTraceContentPart[];
  attachedContext: CursorAttachedContextEntry[];
};

export type CursorSubagentDispatch = {
  childComposerId: string;
  label: string;
  model: string | null;
};

export type CursorRequestRow = {
  bubbleKey: string;
  bubbleId: string;
  role: "User" | "Agent";
  createdAtSec: number | null;
  model: string | null;
  contextPct: number | null;
  content: CursorTraceContentPart[];
  attachedContext: CursorAttachedContextEntry[];
  preview: string;
  toolNames: string[];
  dispatch: CursorSubagentDispatch | null;
  subagentBranch: ParsedCursorComposer | null;
};

export type CursorInteraction = {
  idx: number;
  startedSec: number | null;
  endedSec: number | null;
  requestCount: number;
  model: string | null;
  toolSummary: { name: string; count: number }[];
  costUsd: number | null;
  interactionMode: CursorInteractionMode;
  reverted: boolean;
  userBubbleId: string | null;
  requests: CursorRequestRow[];
};

export type ParsedCursorComposer = {
  composerId: string;
  composerName: string | null;
  projectPath: string | null;
  workspaceId: string | null;
  sessionUnifiedMode: CursorInteractionMode | null;
  requests: CursorRequestRow[];
  interactions: CursorInteraction[];
  userRequestCount: number;
  agentRequestCount: number;
  startedAtSec: number | null;
  lastRequestAtSec: number | null;
};
