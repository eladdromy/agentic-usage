import type { GlobalBubbleStub } from "@/lib/cursor/billing-event-attribution";
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
import {
  BUBBLE_KEY_MAX,
  BUBBLE_KEY_MIN,
  isCursorBubbleIndexReady,
  loadGlobalBubblesForAttach,
  queryIndexedBubbleKeysInRange,
} from "@/lib/cursor/cursor-bubble-index";
import {
  CURSOR_DISK_KV_TABLE,
  cursorDiskKvTableExists,
  getReadonlyCursorDatabase,
} from "@/lib/cursor/vscdb";
import { readSettings } from "@/lib/profile/settings";

const BUFFER_SEC = 60;

/** Load user + agent bubbles from global vscdb for a billing date window only. */
export function loadGlobalBubblesInRange(
  fromSec: number,
  toSec: number,
  dbPath?: string,
  options?: { fastPath?: boolean },
): GlobalBubbleStub[] {
  const resolved =
    dbPath ??
    getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);

  if (!cursorVscdbExists(resolved)) return [];

  return loadGlobalBubblesForAttach(fromSec, toSec, resolved, options);
}

export function resolveVscdbPathForAttribution(): string {
  return getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
}

export function isVscdbAvailableForAttribution(): boolean {
  return cursorVscdbExists(resolveVscdbPathForAttribution());
}

/** All `task_v2` dispatch bubbles (for subagent → parent project roll-up). */
export function loadTaskV2DispatchBubbles(
  dbPath?: string,
  range?: { fromSec: number; toSec: number },
): TaskV2DispatchBubble[] {
  const resolved =
    dbPath ??
    getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);

  if (!cursorVscdbExists(resolved)) return [];

  try {
    const db = getReadonlyCursorDatabase(resolved);
    if (!cursorDiskKvTableExists(db)) return [];

    const roughFrom =
      range != null ? Math.floor(range.fromSec - BUFFER_SEC) : null;
    const roughTo = range != null ? Math.ceil(range.toSec + BUFFER_SEC) : null;

    if (
      roughFrom != null &&
      roughTo != null &&
      isCursorBubbleIndexReady(resolved)
    ) {
      const keys = queryIndexedBubbleKeysInRange(roughFrom, roughTo, resolved);
      const getKv = db.prepare(
        `SELECT key, CAST(value AS TEXT) AS value
         FROM ${CURSOR_DISK_KV_TABLE}
         WHERE key = ?`,
      );

      const out: TaskV2DispatchBubble[] = [];
      for (const key of keys) {
        const row = getKv.get(key) as { key: string; value: string } | undefined;
        if (!row?.value.includes('"name":"task_v2"')) continue;

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
    }

    const select = db.prepare(
      `SELECT key, CAST(value AS TEXT) AS value
       FROM ${CURSOR_DISK_KV_TABLE}
       WHERE key >= ?
         AND key < ?`,
    );

    const out: TaskV2DispatchBubble[] = [];
    for (const row of select.iterate(BUBBLE_KEY_MIN, BUBBLE_KEY_MAX) as Iterable<{
      key: string;
      value: string;
    }>) {
      if (!row.value.includes('"name":"task_v2"')) continue;

      if (roughFrom != null && roughTo != null) {
        const createdAtSec = parseBubbleCreatedAtSecFromRaw(row.value);
        if (
          createdAtSec == null ||
          createdAtSec < roughFrom ||
          createdAtSec > roughTo
        ) {
          continue;
        }
      }

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
