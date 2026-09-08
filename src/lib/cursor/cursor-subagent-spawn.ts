/** `task_v2` subagent spawn detection (Agentic_Usage parity). */

function safeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringField(
  obj: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeToolFormerEntries(raw: unknown): Record<string, unknown>[] {
  const parsed = safeParseJson(raw);
  if (Array.isArray(parsed)) {
    return parsed
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => !!entry);
  }
  const single = asRecord(parsed);
  return single ? [single] : [];
}

export function parseComposerIdFromBubbleKey(key: string): string | null {
  if (!key.startsWith("bubbleId:")) return null;
  return key.split(":")[1]?.trim() || null;
}

/**
 * Child composer ids from `task_v2` entries in one bubble raw JSON.
 * Prefers `additionalData.subagentComposerId`, falls back to `result.agentId`.
 */
export function extractSpawnedSubagentComposerIdsFromRaw(raw: string): string[] {
  const root = asRecord(safeParseJson(raw));
  if (!root) return [];

  const entries = normalizeToolFormerEntries(root.toolFormerData);
  if (entries.length === 0) return [];

  const spawnedComposerIds: string[] = [];
  for (const entry of entries) {
    const toolName = readStringField(entry, ["name"]);
    if (toolName !== "task_v2") continue;

    const additionalData = asRecord(safeParseJson(entry.additionalData));
    const result = asRecord(safeParseJson(entry.result));
    const spawnedComposerId =
      readStringField(additionalData, ["subagentComposerId"]) ??
      readStringField(result, ["agentId"]);
    if (!spawnedComposerId) continue;
    spawnedComposerIds.push(spawnedComposerId);
  }

  return spawnedComposerIds;
}

export type TaskV2DispatchBubble = {
  key: string;
  parentComposerId: string;
  raw: string;
};

/**
 * Map child composer id → parent project path for `task_v2` dispatches.
 * Child composers without their own workspace inherit the parent's project.
 */
export function buildSubagentParentProjectIndex(
  dispatches: readonly TaskV2DispatchBubble[],
  resolveProject: (composerId: string) => string | null,
): Map<string, string> {
  const childToParentProject = new Map<string, string>();

  for (const dispatch of dispatches) {
    const parentProject = resolveProject(dispatch.parentComposerId);
    if (!parentProject) continue;

    for (const childId of extractSpawnedSubagentComposerIdsFromRaw(
      dispatch.raw,
    )) {
      if (!childToParentProject.has(childId)) {
        childToParentProject.set(childId, parentProject);
      }
    }
  }

  return childToParentProject;
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Yields periodically so UI polls can observe prep progress on large months. */
export async function buildSubagentParentProjectIndexAsync(
  dispatches: readonly TaskV2DispatchBubble[],
  resolveProject: (composerId: string) => string | null,
): Promise<Map<string, string>> {
  const childToParentProject = new Map<string, string>();

  for (let index = 0; index < dispatches.length; index++) {
    const dispatch = dispatches[index]!;
    const parentProject = resolveProject(dispatch.parentComposerId);
    if (!parentProject) continue;

    for (const childId of extractSpawnedSubagentComposerIdsFromRaw(
      dispatch.raw,
    )) {
      if (!childToParentProject.has(childId)) {
        childToParentProject.set(childId, parentProject);
      }
    }

    if ((index + 1) % 200 === 0) {
      await yieldEventLoop();
    }
  }

  return childToParentProject;
}
