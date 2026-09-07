import type { ClaudeMessageUsage } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function displayModelName(model: string): string {
  return model.trim();
}

export function usageFromClaudeRecord(
  record: Record<string, unknown>,
): { usage: ClaudeMessageUsage; model: string } | null {
  if (record.type !== "assistant") return null;
  const message = record.message;
  if (!isRecord(message)) return null;
  const usage = message.usage;
  if (!isRecord(usage)) return null;

  const model =
    typeof message.model === "string" ? message.model.trim() : "";
  if (!model) return null;

  return {
    model: displayModelName(model),
    usage: usage as ClaudeMessageUsage,
  };
}

export function costUsdFromClaudeRecord(
  record: Record<string, unknown>,
): number | null {
  const costRaw = record.costUSD;
  if (typeof costRaw === "number" && Number.isFinite(costRaw)) return costRaw;
  return null;
}

export function recordTimestampSec(
  record: Record<string, unknown>,
): number | null {
  const ts = record.timestamp;
  if (typeof ts === "string") {
    const ms = Date.parse(ts);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  if (typeof ts === "number" && Number.isFinite(ts)) {
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  }
  return null;
}

export function parseSessionPath(
  fileKey: string,
  record: Record<string, unknown>,
): { projectSlug: string; sessionId: string } {
  const rootMatch = fileKey.match(/^projects\/([^/]+)\/([^/]+)\.jsonl$/);
  if (rootMatch) {
    return { projectSlug: rootMatch[1], sessionId: rootMatch[2] };
  }

  const subagentMatch = fileKey.match(
    /^projects\/([^/]+)\/([^/]+)\/subagents\/[^/]+\.jsonl$/,
  );
  if (subagentMatch) {
    return { projectSlug: subagentMatch[1], sessionId: subagentMatch[2] };
  }

  const sessionId =
    typeof record.session_id === "string" && record.session_id.trim()
      ? record.session_id.trim()
      : "";

  const projectMatch = fileKey.match(/^projects\/([^/]+)\//);
  return {
    projectSlug: projectMatch?.[1] ?? "",
    sessionId,
  };
}
