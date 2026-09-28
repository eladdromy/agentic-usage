import type { CursorAttachedContextEntry, CursorTraceContentPart } from "./types";
import { isPlainObject, parseTopLevelObject, strOrNull } from "./json";

function hasPresentValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

export function extractModelInfo(parsed: Record<string, unknown>): string | null {
  const raw = parsed.modelInfo ?? parsed.modelinfo;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return strOrNull(raw);
  if (isPlainObject(raw)) {
    return strOrNull(raw.modelName ?? raw.modelname);
  }
  return null;
}

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

export function toolNamesFromContent(parts: CursorTraceContentPart[]): string[] {
  const names: string[] = [];
  for (const part of parts) {
    if (part.kind === "tool" && part.name) names.push(part.name);
  }
  return names;
}

/** Cursor stores thinking as a string or as `{ text, signature }`. */
function thinkingPart(value: unknown): CursorTraceContentPart | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { kind: "thinking", value: trimmed } : null;
  }
  if (!isPlainObject(value)) return null;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  const signature =
    typeof value.signature === "string" && value.signature.trim()
      ? value.signature.trim()
      : null;
  if (text && signature) return { kind: "thinking", value: { text, signature } };
  if (text) return { kind: "thinking", value: text };
  if (signature) return { kind: "thinking", value: { encrypted: true, signature } };
  return null;
}

function thinkingPreviewText(value: CursorTraceContentPart & { kind: "thinking" }): string {
  if (typeof value.value === "string") return value.value;
  if ("text" in value.value) return value.value.text;
  return "";
}

export function extractBubbleContentParts(
  parsed: Record<string, unknown>,
): CursorTraceContentPart[] {
  const out: CursorTraceContentPart[] = [];
  if (hasPresentValue(parsed.text) && typeof parsed.text === "string") {
    out.push({ kind: "text", value: parsed.text });
  }
  const thinking = thinkingPart(parsed.thinking);
  if (thinking) out.push(thinking);
  for (const entry of normalizeToolFormerEntries(parsed.toolFormerData)) {
    const name = strOrNull(entry.name) ?? "tool";
    out.push({
      kind: "tool",
      name,
      toolCallId: strOrNull(entry.toolCallId),
      params: safeParseJson(entry.params) ?? entry.params ?? null,
      result: safeParseJson(entry.result) ?? entry.result ?? null,
    });
  }
  return out;
}

function contextItemLabel(contextKey: string, item: unknown): string | null {
  if (typeof item === "string") return strOrNull(item);
  if (!isPlainObject(item)) return null;
  if (contextKey === "cursorRules") return strOrNull(item.filename);
  return strOrNull(
    item.relativeWorkspacePath ??
      item.uri ??
      item.fsPath ??
      item.path ??
      item.filename ??
      item.name,
  );
}

export function extractAttachedContext(
  parsed: Record<string, unknown>,
): CursorAttachedContextEntry[] {
  const ctx = parsed.context;
  if (!isPlainObject(ctx)) return [];
  const out: CursorAttachedContextEntry[] = [];
  for (const [key, value] of Object.entries(ctx)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const label = contextItemLabel(key, item);
      if (label) out.push({ category: key, label });
    }
  }
  return out;
}

export function contextPctFromBubble(parsed: Record<string, unknown>): number | null {
  const status = parsed.contextWindowStatusAtCreation;
  if (!isPlainObject(status)) return null;
  const rem = status.percentageRemaining;
  if (typeof rem !== "number" || !Number.isFinite(rem)) return null;
  return Math.max(0, Math.min(100, Math.round(100 - rem)));
}

export function previewFromParts(parts: CursorTraceContentPart[]): string {
  for (const part of parts) {
    if (part.kind === "text" && part.value.trim()) {
      return part.value.replace(/\s+/g, " ").trim().slice(0, 160);
    }
  }
  for (const part of parts) {
    if (part.kind === "thinking") {
      const text = thinkingPreviewText(part).replace(/\s+/g, " ").trim();
      if (text) return text.slice(0, 160);
    }
  }
  for (const part of parts) {
    if (part.kind === "tool") return part.name;
  }
  return "Agent";
}

export function parseBubbleRaw(raw: string): {
  type: number;
  isSimulatedMsg: boolean;
  model: string | null;
  contextPct: number | null;
  content: CursorTraceContentPart[];
  attachedContext: CursorAttachedContextEntry[];
  preview: string;
} {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) {
    return {
      type: 2,
      isSimulatedMsg: false,
      model: null,
      contextPct: null,
      content: [],
      attachedContext: [],
      preview: "",
    };
  }
  const type = typeof parsed.type === "number" ? parsed.type : 2;
  const isSimulatedMsg =
    parsed.isSimulatedMsg === true ||
    parsed.isSimulatedMsg === 1 ||
    parsed.isSimulatedMsg === "true";
  const content = extractBubbleContentParts(parsed);
  return {
    type,
    isSimulatedMsg,
    model: extractModelInfo(parsed),
    contextPct: contextPctFromBubble(parsed),
    content,
    attachedContext: extractAttachedContext(parsed),
    preview: previewFromParts(content),
  };
}
