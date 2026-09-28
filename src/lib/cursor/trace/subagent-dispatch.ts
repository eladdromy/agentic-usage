import { isPlainObject, parseTopLevelObject, strOrNull } from "./json";
import type { CursorSubagentDispatch } from "./types";

function safeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeToolFormerEntries(raw: unknown): Record<string, unknown>[] {
  const parsed = safeParseJson(raw);
  if (Array.isArray(parsed)) {
    return parsed
      .map((e) => (isPlainObject(e) ? e : null))
      .filter((e): e is Record<string, unknown> => e != null);
  }
  return isPlainObject(parsed) ? [parsed] : [];
}

function readField(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function extractSubagentDispatchFromRaw(raw: string): CursorSubagentDispatch | null {
  const root = parseTopLevelObject(raw);
  if (!root) return null;

  for (const entry of normalizeToolFormerEntries(root.toolFormerData)) {
    if (readField(entry, ["name"]) !== "task_v2") continue;

    const params = isPlainObject(safeParseJson(entry.params))
      ? (safeParseJson(entry.params) as Record<string, unknown>)
      : isPlainObject(entry.params)
        ? entry.params
        : null;
    const result = isPlainObject(safeParseJson(entry.result))
      ? (safeParseJson(entry.result) as Record<string, unknown>)
      : isPlainObject(entry.result)
        ? entry.result
        : null;
    const additionalData = isPlainObject(entry.additionalData)
      ? entry.additionalData
      : isPlainObject(safeParseJson(entry.additionalData))
        ? (safeParseJson(entry.additionalData) as Record<string, unknown>)
        : null;

    const childComposerId =
      readField(additionalData, ["subagentComposerId"]) ??
      readField(result, ["agentId"]);
    if (!childComposerId) continue;

    const description =
      readField(params, ["description", "taskDescription"]) ??
      readField(result, ["description"]);
    const subagentType =
      readField(params, ["subagentType", "subagent_type", "type"]) ??
      readField(result, ["subagentType", "subagent_type", "type"]);
    const model =
      readField(params, ["model", "modelName"]) ??
      readField(result, ["model", "modelName"]);

    const label = subagentType ?? description ?? "Subagent";
    return { childComposerId, label, model };
  }
  return null;
}

export function extractAllSpawnedComposerIds(raw: string): string[] {
  const root = parseTopLevelObject(raw);
  if (!root) return [];
  const ids: string[] = [];
  for (const entry of normalizeToolFormerEntries(root.toolFormerData)) {
    if (readField(entry, ["name"]) !== "task_v2") continue;
    const additionalData = isPlainObject(entry.additionalData)
      ? entry.additionalData
      : null;
    const result = isPlainObject(safeParseJson(entry.result))
      ? (safeParseJson(entry.result) as Record<string, unknown>)
      : null;
    const child =
      readField(additionalData, ["subagentComposerId"]) ??
      readField(result, ["agentId"]);
    if (child) ids.push(child);
  }
  return ids;
}
