/**
 * Claude JSONL record -> normalized trace content.
 *
 * Ported and simplified from Agentic_Usage's Claude parsing helpers, keeping
 * only what the trace UI needs (text / thinking / tool_use / tool_result) and
 * dropping the Cursor "composer" indirection.
 */

import type {
  SessionAgentKind,
  TraceContentPart,
  TraceThinkingValue,
  TraceToolUsage,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const SYNTHETIC_CLAUDE_MODEL = "<synthetic>";

/** Claude JSONL uses `<synthetic>` for usage rows with no real model id. */
export function isSyntheticClaudeModel(model: string | null | undefined): boolean {
  return model?.trim().toLowerCase() === SYNTHETIC_CLAUDE_MODEL;
}

export function displayClaudeModelName(model: string | null | undefined): string {
  const trimmed = model?.trim();
  if (!trimmed) return "Unknown";
  if (isSyntheticClaudeModel(trimmed)) return "Unattributed";
  return trimmed;
}

export function extractClaudeModel(record: Record<string, unknown>): string | null {
  const message = record.message;
  if (!isRecord(message)) return null;
  const model = message.model;
  if (typeof model === "string" && model.trim()) return model.trim();
  return null;
}

/** First assistant model in chronological order (used for interaction/branch labels). */
export function deriveModelLabel(
  requests: readonly { role: "User" | "Agent"; model: string | null }[],
): string | null {
  for (const row of requests) {
    const model = row.model?.trim();
    if (model) return displayClaudeModelName(model);
  }
  return null;
}

// --- User prompt / tool result detection ------------------------------------

function messageContent(record: Record<string, unknown>): unknown {
  const message = record.message;
  if (!isRecord(message)) return undefined;
  return message.content;
}

function isLocalCommandContent(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith("<command-name>") ||
    t.startsWith("<local-command-") ||
    t.startsWith("<local-command-caveat>")
  );
}

/** True when a record is a real user prompt (not tool result / meta / CLI noise). */
export function isClaudeUserPromptRecord(record: Record<string, unknown>): boolean {
  if (record.type !== "user") return false;
  if (record.isMeta === true) return false;

  const content = messageContent(record);
  if (typeof content === "string") {
    if (isLocalCommandContent(content)) return false;
    return content.trim().length > 0;
  }
  if (isToolResultUserContent(content)) return false;
  if (Array.isArray(content)) {
    return content.some(
      (item) =>
        isRecord(item) &&
        item.type === "text" &&
        typeof item.text === "string" &&
        item.text.trim().length > 0,
    );
  }
  return false;
}

function isToolResultUserContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (item) =>
      isRecord(item) && (item.type === "tool_result" || "tool_use_id" in item),
  );
}

export function isToolResultUserRecord(record: Record<string, unknown>): boolean {
  if (record.type !== "user") return false;
  return isToolResultUserContent(messageContent(record));
}

// --- Agent kind / tool metadata ---------------------------------------------

export function extractClaudeAgentKind(
  record: Record<string, unknown>,
  role: "User" | "Agent",
): SessionAgentKind {
  if (role === "User") {
    const content = messageContent(record);
    if (Array.isArray(content) && content.some((c) => isRecord(c) && c.type === "tool_result")) {
      return "tool_result";
    }
    return null;
  }

  const content = messageContent(record);
  if (!Array.isArray(content) || content.length === 0) return null;

  const types = content
    .filter(isRecord)
    .map((p) => p.type)
    .filter((t): t is string => typeof t === "string");

  if (types.includes("tool_use")) return "tool_use";
  if (types.includes("thinking")) return "thinking";
  if (types.includes("text")) return "text";
  return null;
}

export function extractClaudeToolName(record: Record<string, unknown>): string | null {
  const content = messageContent(record);
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!isRecord(part) || part.type !== "tool_use") continue;
    if (typeof part.name === "string" && part.name.trim()) return part.name.trim();
  }
  return null;
}

export function extractClaudeToolUseId(record: Record<string, unknown>): string | null {
  const content = messageContent(record);
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!isRecord(part) || part.type !== "tool_use") continue;
    if (typeof part.id === "string" && part.id.trim()) return part.id.trim();
  }
  return null;
}

// --- Content normalization ---------------------------------------------------

function thinkingValue(item: Record<string, unknown>): TraceThinkingValue {
  const text = typeof item.thinking === "string" ? item.thinking : "";
  if (text.trim()) return text;
  const signature =
    typeof item.signature === "string" && item.signature.trim()
      ? item.signature.trim()
      : null;
  return { encrypted: true, signature };
}

/** Normalize one JSONL record's `message.content` into trace content parts. */
export function claudeRecordToContent(
  record: Record<string, unknown>,
): TraceContentPart[] {
  const content = messageContent(record);
  const parts: TraceContentPart[] = [];

  if (typeof content === "string") {
    if (content.trim()) parts.push({ kind: "text", value: content });
    return parts;
  }

  if (!Array.isArray(content)) return parts;

  for (const item of content) {
    if (!isRecord(item)) continue;
    const t = item.type;
    if (t === "text" && typeof item.text === "string") {
      if (item.text.trim()) parts.push({ kind: "text", value: item.text });
    } else if (t === "thinking") {
      parts.push({ kind: "thinking", value: thinkingValue(item) });
    } else if (t === "tool_use") {
      parts.push({
        kind: "tool_use",
        toolUseId: typeof item.id === "string" ? item.id : null,
        name: typeof item.name === "string" ? item.name : "tool",
        input: item.input ?? null,
      });
    } else if (t === "tool_result") {
      parts.push({
        kind: "tool_result",
        toolUseId: typeof item.tool_use_id === "string" ? item.tool_use_id : null,
        content: item.content ?? null,
        isError: item.is_error === true,
      });
    }
  }

  return parts;
}

export function toolUsageFromContent(parts: TraceContentPart[]): TraceToolUsage[] {
  const counts = new Map<string, number>();
  for (const part of parts) {
    if (part.kind !== "tool_use") continue;
    counts.set(part.name, (counts.get(part.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function mergeToolUsage(lists: TraceToolUsage[][]): TraceToolUsage[] {
  const merged = new Map<string, number>();
  for (const list of lists) {
    for (const entry of list) {
      merged.set(entry.name, (merged.get(entry.name) ?? 0) + entry.count);
    }
  }
  return [...merged.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// --- Context fill % ----------------------------------------------------------

/** Claude Code uses a 200k context window for all models. */
export const CLAUDE_CONTEXT_WINDOW_TOKENS = 200_000;

function coerceNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Context fill % from an assistant record's `message.usage`. */
export function extractClaudeContextUsedPct(
  record: Record<string, unknown>,
): number | null {
  if (record.type !== "assistant") return null;
  const message = record.message;
  if (!isRecord(message)) return null;
  const usage = message.usage;
  if (!isRecord(usage)) return null;
  const input = coerceNumber(usage.input_tokens);
  const cacheRead = coerceNumber(usage.cache_read_input_tokens);
  const cacheCreate = coerceNumber(usage.cache_creation_input_tokens);
  if (input === null && cacheRead === null && cacheCreate === null) return null;
  const tokens = (input ?? 0) + (cacheRead ?? 0) + (cacheCreate ?? 0);
  if (tokens <= 0) return null;
  return Math.min(
    100,
    Math.max(0, Math.round((100 * tokens) / CLAUDE_CONTEXT_WINDOW_TOKENS)),
  );
}
