import { parseTopLevelObject } from "./json";

export type CursorInteractionMode = "agent" | "ask" | "plan" | "default";

export interface BubbleModeFields {
  unifiedModeRaw: string | number | null;
  isPlanExecution: boolean;
  planUri: string | null;
}

export function normalizeSessionUnifiedMode(
  raw: string | null | undefined,
): CursorInteractionMode | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "chat" || s === "ask") return "ask";
  if (s === "agent") return "agent";
  if (s === "plan") return "plan";
  return null;
}

export function extractBubbleModeFields(raw: string): BubbleModeFields {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) {
    return { unifiedModeRaw: null, isPlanExecution: false, planUri: null };
  }

  let unifiedModeRaw: string | number | null = null;
  if (parsed.unifiedMode != null) {
    const um = parsed.unifiedMode;
    if (typeof um === "number" && Number.isFinite(um)) unifiedModeRaw = um;
    else if (typeof um === "string" && um.trim()) unifiedModeRaw = um.trim();
  }

  const isPlanExecution =
    parsed.isPlanExecution === true ||
    parsed.isPlanExecution === 1 ||
    parsed.isPlanExecution === "true";

  const planUri =
    typeof parsed.planUri === "string" && parsed.planUri.trim()
      ? parsed.planUri.trim()
      : null;

  return { unifiedModeRaw, isPlanExecution, planUri };
}

function classifyFromNumericUnifiedMode(
  numeric: number,
  sessionUnifiedMode: CursorInteractionMode | null,
): CursorInteractionMode {
  if (sessionUnifiedMode === "plan" || numeric === 5) return "plan";
  if (sessionUnifiedMode === "ask") return "ask";
  if (sessionUnifiedMode === "agent") return "agent";
  if (numeric === 1) return "ask";
  return "agent";
}

export function classifyCursorInteractionMode(input: {
  bubbleFields: BubbleModeFields;
  sessionUnifiedMode: CursorInteractionMode | null;
}): CursorInteractionMode {
  const { bubbleFields, sessionUnifiedMode } = input;
  if (bubbleFields.isPlanExecution || bubbleFields.planUri) return "plan";
  const { unifiedModeRaw } = bubbleFields;
  if (unifiedModeRaw === null) return "default";
  if (typeof unifiedModeRaw === "string") {
    return normalizeSessionUnifiedMode(unifiedModeRaw) ?? "default";
  }
  return classifyFromNumericUnifiedMode(unifiedModeRaw, sessionUnifiedMode);
}

export function formatInteractionModeLabel(mode: CursorInteractionMode): string {
  switch (mode) {
    case "agent":
      return "Agent";
    case "ask":
      return "Ask";
    case "plan":
      return "Plan";
    default:
      return "Default";
  }
}
