import { parseBubbleCreatedAtSecFromRaw } from "@/lib/cursor/parse-bubble-created-at";
import {
  extractSpawnedSubagentComposerIdsFromRaw,
  parseComposerIdFromBubbleKey,
  type TaskV2DispatchBubble,
} from "@/lib/cursor/cursor-subagent-spawn";
import {
  cursorVscdbExists,
  getResolvedVscdbPath,
} from "@/lib/cursor/path";
import type { GlobalBubbleStub } from "@/lib/cursor/billing-event-attribution";
import {
  CURSOR_DISK_KV_TABLE,
  cursorDiskKvTableExists,
  getReadonlyCursorDatabase,
} from "@/lib/cursor/vscdb";
import { readSettings } from "@/lib/profile/settings";

const BUFFER_SEC = 60;

function composerIdFromBubbleKey(key: string): string | null {
  if (!key.startsWith("bubbleId:")) return null;
  return key.split(":")[1]?.trim() || null;
}

function bubbleTypeFromRaw(raw: string): 1 | 2 | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    const t = parsed.type;
    if (t === 1 || t === 2) return t;
    return null;
  } catch {
    return null;
  }
}

/** Load user + agent bubbles from global vscdb for a billing date window only. */
export function loadGlobalBubblesInRange(
  fromSec: number,
  toSec: number,
  dbPath?: string,
): GlobalBubbleStub[] {
  const resolved =
    dbPath ??
    getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);

  if (!cursorVscdbExists(resolved)) return [];

  try {
    const db = getReadonlyCursorDatabase(resolved);
    if (!cursorDiskKvTableExists(db)) return [];

    const roughFrom = Math.floor(fromSec - BUFFER_SEC);
    const roughTo = Math.ceil(toSec + BUFFER_SEC);

    const rows = db
      .prepare(
        `SELECT key, CAST(value AS TEXT) AS value
         FROM ${CURSOR_DISK_KV_TABLE}
         WHERE key LIKE 'bubbleId:%'
           AND json_valid(CAST(value AS TEXT))
           AND CAST(json_extract(CAST(value AS TEXT), '$.type') AS INTEGER) IN (1, 2)
           AND unixepoch(json_extract(CAST(value AS TEXT), '$.createdAt')) >= ?
           AND unixepoch(json_extract(CAST(value AS TEXT), '$.createdAt')) <= ?`,
      )
      .all(roughFrom, roughTo) as { key: string; value: string }[];

    const stubs: GlobalBubbleStub[] = [];
    for (const row of rows) {
      const composerId = composerIdFromBubbleKey(row.key);
      const bubbleType = bubbleTypeFromRaw(row.value);
      const createdAtSec = parseBubbleCreatedAtSecFromRaw(row.value);
      if (!composerId || !bubbleType || createdAtSec == null) continue;
      if (
        createdAtSec < fromSec - BUFFER_SEC ||
        createdAtSec > toSec + BUFFER_SEC
      ) {
        continue;
      }
      stubs.push({ composerId, createdAtSec, bubbleType });
    }

    return stubs;
  } catch {
    return [];
  }
}

export function resolveVscdbPathForAttribution(): string {
  return getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
}

export function isVscdbAvailableForAttribution(): boolean {
  return cursorVscdbExists(resolveVscdbPathForAttribution());
}

/** All `task_v2` dispatch bubbles (for subagent → parent project roll-up). */
export function loadTaskV2DispatchBubbles(dbPath?: string): TaskV2DispatchBubble[] {
  const resolved =
    dbPath ??
    getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);

  if (!cursorVscdbExists(resolved)) return [];

  try {
    const db = getReadonlyCursorDatabase(resolved);
    if (!cursorDiskKvTableExists(db)) return [];

    const rows = db
      .prepare(
        `SELECT key, CAST(value AS TEXT) AS value
         FROM ${CURSOR_DISK_KV_TABLE}
         WHERE key LIKE 'bubbleId:%'
           AND json_valid(CAST(value AS TEXT))
           AND CAST(json_extract(CAST(value AS TEXT), '$.type') AS INTEGER) = 2
           AND CAST(value AS TEXT) LIKE '%"name":"task_v2"%'`,
      )
      .all() as { key: string; value: string }[];

    const out: TaskV2DispatchBubble[] = [];
    for (const row of rows) {
      const parentComposerId = parseComposerIdFromBubbleKey(row.key);
      if (!parentComposerId) continue;
      if (extractSpawnedSubagentComposerIdsFromRaw(row.value).length === 0) {
        continue;
      }
      out.push({
        key: row.key,
        parentComposerId,
        raw: row.value,
      });
    }
    return out;
  } catch {
    return [];
  }
}
