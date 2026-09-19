import type Database from "better-sqlite3";

import { parseBubbleCreatedAtSecFromRaw } from "@/lib/cursor/parse-bubble-created-at";
import {
  queryBubbleKeysForComposer,
} from "@/lib/cursor/cursor-bubble-index";
import {
  composerBubbleKeyRange,
  CURSOR_DISK_KV_TABLE,
  cursorDiskKvTableExists,
} from "@/lib/cursor/vscdb";
import { projectPathFromComposerDataRaw } from "@/lib/cursor/project-attribution";

import { buildFullInteractionBubbleIds } from "./composer-data";
import {
  composerNameFromDataRaw,
  sessionUnifiedModeFromDataRaw,
  workspaceIdFromDataRaw,
} from "./composer-data";
import { parseBubbleRaw } from "./content";
import { groupCursorInteractions } from "./interactions";
import { bubbleUuidFromKey } from "./json";
import { parseConversationHeaderBubbleIds, revertedInteractionIndexes } from "./reverts";
import { recoverRehydratedBubbleTimes } from "./rehydrate";
import { extractSubagentDispatchFromRaw } from "./subagent-dispatch";
import { toolNamesFromContent } from "./content";
import type {
  CursorBubbleRow,
  CursorRequestRow,
  ParsedCursorComposer,
} from "./types";

function isRealUser(type: number, isSimulatedMsg: boolean): boolean {
  return type === 1 && !isSimulatedMsg;
}

export function loadComposerBubbles(
  db: Database.Database,
  composerId: string,
  vscdbPath?: string,
): CursorBubbleRow[] {
  const selectRow = db.prepare(
    `SELECT key, CAST(value AS TEXT) AS value
     FROM ${CURSOR_DISK_KV_TABLE}
     WHERE key = ?`,
  );
  const selectRange = db.prepare(
    `SELECT key, CAST(value AS TEXT) AS value
     FROM ${CURSOR_DISK_KV_TABLE}
     WHERE key >= ? AND key < ?`,
  );

  const indexedKeys = vscdbPath
    ? queryBubbleKeysForComposer(composerId, vscdbPath)
    : null;

  let rows: { key: string; value: string }[];
  if (indexedKeys !== null) {
    if (indexedKeys.length === 0) return [];
    rows = [];
    for (const key of indexedKeys) {
      const row = selectRow.get(key) as { key: string; value: string } | undefined;
      if (row) rows.push(row);
    }
  } else {
    const { min, max } = composerBubbleKeyRange(composerId);
    rows = selectRange.all(min, max) as { key: string; value: string }[];
  }

  const rawBubbles: Array<{
    key: string;
    type: number;
    isSimulatedMsg: boolean;
    createdAt: number | null;
    raw: string;
  }> = [];

  for (const row of rows) {
    const parsed = parseBubbleRaw(row.value);
    const createdAtSec = parseBubbleCreatedAtSecFromRaw(row.value);
    rawBubbles.push({
      key: row.key,
      type: parsed.type,
      isSimulatedMsg: parsed.isSimulatedMsg,
      createdAt: createdAtSec,
      raw: row.value,
    });
  }

  const composerDataRow = db
    .prepare(
      `SELECT CAST(value AS TEXT) AS value FROM ${CURSOR_DISK_KV_TABLE} WHERE key = ?`,
    )
    .get(`composerData:${composerId}`) as { value: string } | undefined;

  const headerIds = composerDataRow?.value
    ? parseConversationHeaderBubbleIds(composerDataRow.value)
    : null;

  const rehydrated = recoverRehydratedBubbleTimes(rawBubbles, headerIds ?? undefined);

  const timelineMeta = rehydrated.bubbles.map((b) => ({
    bubbleId: bubbleUuidFromKey(b.key) ?? b.key,
    type: b.type,
    createdAtSec: b.createdAt,
    isSimulatedMsg: b.isSimulatedMsg,
  }));

  const orderIds =
    timelineMeta.length > 0 ? buildFullInteractionBubbleIds(timelineMeta) : [];
  const orderMap = new Map(orderIds.map((id, i) => [id, i]));

  const out: CursorBubbleRow[] = [];
  for (const b of rehydrated.bubbles) {
    const bubbleId = bubbleUuidFromKey(b.key);
    if (!bubbleId) continue;
    const parsed = parseBubbleRaw(b.raw);
    out.push({
      bubbleKey: b.key,
      bubbleId,
      type: b.type,
      isSimulatedMsg: b.isSimulatedMsg,
      createdAtSec: b.createdAt,
      raw: b.raw,
      model: parsed.model,
      contextPct: parsed.contextPct,
      preview: parsed.preview,
      content: parsed.content,
      attachedContext: parsed.attachedContext,
    });
  }

  out.sort((a, b) => {
    const oa = orderMap.get(a.bubbleId);
    const ob = orderMap.get(b.bubbleId);
    if (oa != null && ob != null) return oa - ob;
    if (oa != null) return -1;
    if (ob != null) return 1;
    const ta = a.createdAtSec ?? Number.MAX_SAFE_INTEGER;
    const tb = b.createdAtSec ?? Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.bubbleKey.localeCompare(b.bubbleKey);
  });

  return out;
}

export type ParseComposerOptions = {
  parseSubagent?: (childComposerId: string) => ParsedCursorComposer | null;
};

export function parseComposerFromDb(
  db: Database.Database,
  composerId: string,
  projectPath: string | null,
  options?: ParseComposerOptions & { vscdbPath?: string },
): ParsedCursorComposer | null {
  if (!cursorDiskKvTableExists(db)) return null;

  const composerDataRow = db
    .prepare(
      `SELECT CAST(value AS TEXT) AS value FROM ${CURSOR_DISK_KV_TABLE} WHERE key = ?`,
    )
    .get(`composerData:${composerId}`) as { value: string } | undefined;

  const composerDataRaw = composerDataRow?.value ?? "";
  const composerName = composerDataRaw
    ? composerNameFromDataRaw(composerDataRaw)
    : null;
  const sessionUnifiedMode = composerDataRaw
    ? sessionUnifiedModeFromDataRaw(composerDataRaw)
    : null;
  const workspaceId = composerDataRaw
    ? workspaceIdFromDataRaw(composerDataRaw)
    : null;
  const pathFromKv = composerDataRaw
    ? projectPathFromComposerDataRaw(composerDataRaw)
    : null;
  const resolvedPath = projectPath ?? pathFromKv;

  const bubbles = loadComposerBubbles(db, composerId, options?.vscdbPath);
  if (bubbles.length === 0) return null;

  const userBubbleRawById = new Map<string, string>();
  const requests: CursorRequestRow[] = [];

  for (const bubble of bubbles) {
    const role: "User" | "Agent" = isRealUser(bubble.type, bubble.isSimulatedMsg)
      ? "User"
      : "Agent";
    if (role === "User") userBubbleRawById.set(bubble.bubbleId, bubble.raw);

    const dispatch = extractSubagentDispatchFromRaw(bubble.raw);
    let subagentBranch: ParsedCursorComposer | null = null;
    if (dispatch && options?.parseSubagent) {
      subagentBranch = options.parseSubagent(dispatch.childComposerId);
    }

    requests.push({
      bubbleKey: bubble.bubbleKey,
      bubbleId: bubble.bubbleId,
      role,
      createdAtSec: bubble.createdAtSec,
      model: bubble.model,
      contextPct: bubble.contextPct,
      content: bubble.content,
      attachedContext: bubble.attachedContext,
      preview: bubble.preview,
      toolNames: toolNamesFromContent(bubble.content),
      dispatch,
      subagentBranch,
    });
  }

  const preRevert = groupCursorInteractions(
    requests,
    composerId,
    sessionUnifiedMode,
    userBubbleRawById,
    new Set(),
  );
  const reverted = revertedInteractionIndexes(
    composerDataRaw,
    preRevert.map((i) => ({ idx: i.idx, userBubbleId: i.userBubbleId })),
  );
  const interactions = preRevert.map((i) => ({
    ...i,
    reverted: reverted.has(i.idx),
  }));

  const timestamps = bubbles
    .map((b) => b.createdAtSec)
    .filter((t): t is number => t != null);

  let userRequestCount = 0;
  let agentRequestCount = 0;
  for (const r of requests) {
    if (r.role === "User") userRequestCount += 1;
    else agentRequestCount += 1;
  }

  return {
    composerId,
    composerName,
    projectPath: resolvedPath,
    workspaceId,
    sessionUnifiedMode,
    requests,
    interactions,
    userRequestCount,
    agentRequestCount,
    startedAtSec: timestamps.length ? Math.min(...timestamps) : null,
    lastRequestAtSec: timestamps.length ? Math.max(...timestamps) : null,
  };
}
