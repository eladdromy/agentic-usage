import fs from "fs";
import path from "path";

import type Database from "better-sqlite3";

import DatabaseConstructor from "better-sqlite3";

import { getDataDir } from "@/lib/claude/path";
import {
  parseBubbleCreatedAtSec,
  parseBubbleCreatedAtSecFromRaw,
} from "@/lib/cursor/parse-bubble-created-at";
import type { GlobalBubbleStub } from "@/lib/cursor/billing-event-attribution";
import {
  CURSOR_DISK_KV_TABLE,
  cursorDiskKvTableExists,
  getReadonlyCursorDatabase,
} from "@/lib/cursor/vscdb";

/** Index-friendly lower bound for bubble keys in cursorDiskKV. */
export const BUBBLE_KEY_MIN = "bubbleId:";

/** Index-friendly exclusive upper bound (`:` + 1 => `;`). */
export const BUBBLE_KEY_MAX = "bubbleId;";

const INDEX_DB_PATH = path.join(getDataDir(), "cursor-bubble-index.db");

let indexConn: DatabaseConstructor.Database | null = null;
let indexBuildInFlight: string | null = null;
const indexBuildPromises = new Map<string, Promise<void>>();

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function composerIdFromBubbleKey(key: string): string | null {
  if (!key.startsWith(BUBBLE_KEY_MIN)) return null;
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

function getIndexDatabase(): DatabaseConstructor.Database {
  if (indexConn) return indexConn;
  fs.mkdirSync(getDataDir(), { recursive: true });
  indexConn = new DatabaseConstructor(INDEX_DB_PATH);
  indexConn.exec(`
    CREATE TABLE IF NOT EXISTS bubble_index_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      vscdb_path TEXT NOT NULL,
      vscdb_mtime_ms INTEGER NOT NULL,
      last_key TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS bubble_index (
      key TEXT PRIMARY KEY,
      composer_id TEXT NOT NULL,
      created_at_sec REAL NOT NULL,
      bubble_type INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bubble_index_created
      ON bubble_index (created_at_sec);
  `);
  return indexConn;
}

function readVscdbMtimeMs(vscdbPath: string): number {
  try {
    return fs.statSync(vscdbPath).mtimeMs;
  } catch {
    return 0;
  }
}

function composerHeadersTableExists(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'composerHeaders' LIMIT 1`,
    )
    .get() as { 1: number } | undefined;
  return row !== undefined;
}

function listComposerIds(db: Database.Database): string[] {
  if (composerHeadersTableExists(db)) {
    const rows = db
      .prepare(
        `SELECT DISTINCT composerId AS composerId
         FROM composerHeaders
         WHERE composerId IS NOT NULL AND TRIM(composerId) != ''`,
      )
      .all() as { composerId: string }[];
    if (rows.length > 0) {
      return rows.map((row) => row.composerId.trim()).filter(Boolean);
    }
  }

  const row = db
    .prepare(`SELECT CAST(value AS TEXT) AS value FROM ItemTable WHERE key = ?`)
    .get("composer.composerHeaders") as { value: string } | undefined;
  if (!row?.value) return [];

  try {
    const parsed = JSON.parse(row.value) as {
      allComposers?: { composerId?: unknown }[];
    };
    return (parsed.allComposers ?? [])
      .map((entry) =>
        typeof entry.composerId === "string" ? entry.composerId.trim() : "",
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

type ConversationHeader = {
  type?: unknown;
  createdAt?: unknown;
};

function conversationHeadersFromComposerData(raw: string): ConversationHeader[] {
  try {
    const parsed = JSON.parse(raw) as {
      fullConversationHeadersOnly?: ConversationHeader[];
      conversationHeaders?: ConversationHeader[];
    };
    return (
      parsed.fullConversationHeadersOnly ??
      parsed.conversationHeaders ??
      []
    );
  } catch {
    return [];
  }
}

function composerActivityBounds(raw: string): {
  minSec: number | null;
  maxSec: number | null;
} {
  try {
    const parsed = JSON.parse(raw) as {
      lastUpdatedAt?: unknown;
      updatedAt?: unknown;
      createdAt?: unknown;
    };
    const metaTimes = [parsed.lastUpdatedAt, parsed.updatedAt, parsed.createdAt]
      .map((value) => parseBubbleCreatedAtSec(value))
      .filter((value): value is number => value != null);
    const headers = conversationHeadersFromComposerData(raw);
    const headerTimes = headers
      .map((header) => parseBubbleCreatedAtSec(header.createdAt))
      .filter((value): value is number => value != null);

    const all = [...metaTimes, ...headerTimes];
    if (all.length === 0) return { minSec: null, maxSec: null };
    return {
      minSec: Math.min(...all),
      maxSec: Math.max(...all),
    };
  } catch {
    return { minSec: null, maxSec: null };
  }
}

/**
 * Fast path: read bubble stubs from composerData header metadata (indexed KV
 * lookups per composer) instead of scanning every bubbleId row.
 */
export function loadGlobalBubblesViaComposerHeaders(
  fromSec: number,
  toSec: number,
  vscdbPath: string,
): GlobalBubbleStub[] {
  const db = getReadonlyCursorDatabase(vscdbPath);
  if (!cursorDiskKvTableExists(db)) return [];

  const composerIds = listComposerIds(db);
  if (composerIds.length === 0) return [];

  const getKv = db.prepare(
    `SELECT CAST(value AS TEXT) AS value FROM ${CURSOR_DISK_KV_TABLE} WHERE key = ?`,
  );

  const stubs: GlobalBubbleStub[] = [];
  for (const composerId of composerIds) {
    const row = getKv.get(`composerData:${composerId}`) as
      | { value: string }
      | undefined;
    if (!row?.value) continue;

    const { minSec, maxSec } = composerActivityBounds(row.value);
    if (minSec != null && maxSec != null && (maxSec < fromSec || minSec > toSec)) {
      continue;
    }

    for (const header of conversationHeadersFromComposerData(row.value)) {
      if (header.type !== 1 && header.type !== 2) continue;
      const createdAtSec = parseBubbleCreatedAtSec(header.createdAt);
      if (createdAtSec == null || createdAtSec < fromSec || createdAtSec > toSec) {
        continue;
      }
      stubs.push({
        composerId,
        createdAtSec,
        bubbleType: header.type,
      });
    }
  }

  return stubs;
}

function parseBubbleRow(key: string, raw: string): GlobalBubbleStub | null {
  const composerId = composerIdFromBubbleKey(key);
  const bubbleType = bubbleTypeFromRaw(raw);
  const createdAtSec = parseBubbleCreatedAtSecFromRaw(raw);
  if (!composerId || !bubbleType || createdAtSec == null) return null;
  return { composerId, createdAtSec, bubbleType };
}

async function syncBubbleIndexFromVscdbAsync(
  vscdbPath: string,
  incremental: boolean,
): Promise<void> {
  const vscdb = getReadonlyCursorDatabase(vscdbPath);
  if (!cursorDiskKvTableExists(vscdb)) return;

  const indexDb = getIndexDatabase();
  const meta = indexDb
    .prepare(
      `SELECT vscdb_path, vscdb_mtime_ms, last_key FROM bubble_index_meta WHERE id = 1`,
    )
    .get() as
    | { vscdb_path: string; vscdb_mtime_ms: number; last_key: string }
    | undefined;

  const mtimeMs = readVscdbMtimeMs(vscdbPath);
  const watermark =
    incremental && meta?.vscdb_path === vscdbPath ? meta.last_key : "";

  if (!incremental || !meta || meta.vscdb_path !== vscdbPath) {
    indexDb.exec(`DELETE FROM bubble_index`);
    indexDb.exec(`DELETE FROM bubble_index_meta`);
  }

  const select = watermark
    ? vscdb.prepare(
        `SELECT key, CAST(value AS TEXT) AS value
         FROM ${CURSOR_DISK_KV_TABLE}
         WHERE key > ?
           AND key >= ?
           AND key < ?
         ORDER BY key`,
      )
    : vscdb.prepare(
        `SELECT key, CAST(value AS TEXT) AS value
         FROM ${CURSOR_DISK_KV_TABLE}
         WHERE key >= ?
           AND key < ?
         ORDER BY key`,
      );

  const insert = indexDb.prepare(
    `INSERT OR IGNORE INTO bubble_index (key, composer_id, created_at_sec, bubble_type)
     VALUES (@key, @composer_id, @created_at_sec, @bubble_type)`,
  );

  let lastKey = watermark;
  const batch: Array<{
    key: string;
    composer_id: string;
    created_at_sec: number;
    bubble_type: number;
  }> = [];

  const flush = async () => {
    if (batch.length === 0) return;
    indexDb.transaction(() => {
      for (const row of batch) insert.run(row);
    })();
    batch.length = 0;
    await yieldEventLoop();
  };

  const iter = watermark
    ? select.iterate(watermark, BUBBLE_KEY_MIN, BUBBLE_KEY_MAX)
    : select.iterate(BUBBLE_KEY_MIN, BUBBLE_KEY_MAX);

  for (const row of iter as Iterable<{ key: string; value: string }>) {
    lastKey = row.key;
    const parsed = parseBubbleRow(row.key, row.value);
    if (!parsed) continue;
    batch.push({
      key: row.key,
      composer_id: parsed.composerId,
      created_at_sec: parsed.createdAtSec,
      bubble_type: parsed.bubbleType,
    });
    if (batch.length >= 500) await flush();
  }
  if (batch.length > 0) {
    indexDb.transaction(() => {
      for (const row of batch) insert.run(row);
    })();
  }

  indexDb.prepare(
    `INSERT INTO bubble_index_meta (id, vscdb_path, vscdb_mtime_ms, last_key)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       vscdb_path = excluded.vscdb_path,
       vscdb_mtime_ms = excluded.vscdb_mtime_ms,
       last_key = excluded.last_key`,
  ).run(vscdbPath, mtimeMs, lastKey);
}

export function isCursorBubbleIndexReady(vscdbPath: string): boolean {
  const indexDb = getIndexDatabase();
  const meta = indexDb
    .prepare(`SELECT vscdb_path, vscdb_mtime_ms FROM bubble_index_meta WHERE id = 1`)
    .get() as { vscdb_path: string; vscdb_mtime_ms: number } | undefined;
  if (!meta || meta.vscdb_path !== vscdbPath) return false;

  const count = indexDb
    .prepare(`SELECT COUNT(*) AS count FROM bubble_index`)
    .get() as { count: number };
  if (count.count === 0) return false;

  return readVscdbMtimeMs(vscdbPath) <= meta.vscdb_mtime_ms;
}

export async function ensureCursorBubbleIndexSyncAsync(
  vscdbPath: string,
): Promise<void> {
  if (isCursorBubbleIndexReady(vscdbPath)) return;

  const existing = indexBuildPromises.get(vscdbPath);
  if (existing) {
    await existing;
    return;
  }

  const buildPromise = (async () => {
    indexBuildInFlight = vscdbPath;
    try {
      const indexDb = getIndexDatabase();
      const meta = indexDb
        .prepare(
          `SELECT vscdb_path, vscdb_mtime_ms, last_key FROM bubble_index_meta WHERE id = 1`,
        )
        .get() as
        | { vscdb_path: string; vscdb_mtime_ms: number; last_key: string }
        | undefined;
      const count = indexDb
        .prepare(`SELECT COUNT(*) AS count FROM bubble_index`)
        .get() as { count: number };

      await syncBubbleIndexFromVscdbAsync(
        vscdbPath,
        Boolean(meta && meta.vscdb_path === vscdbPath && count.count > 0),
      );
    } finally {
      indexBuildInFlight = null;
      indexBuildPromises.delete(vscdbPath);
    }
  })();

  indexBuildPromises.set(vscdbPath, buildPromise);
  await buildPromise;
}

export function scheduleCursorBubbleIndexBuild(vscdbPath: string): void {
  void ensureCursorBubbleIndexSyncAsync(vscdbPath);
}

export function queryIndexedBubbleKeysInRange(
  fromSec: number,
  toSec: number,
  vscdbPath: string,
): string[] {
  if (!isCursorBubbleIndexReady(vscdbPath)) return [];

  const rows = getIndexDatabase()
    .prepare(
      `SELECT key FROM bubble_index
       WHERE created_at_sec >= ? AND created_at_sec <= ?
       ORDER BY created_at_sec ASC`,
    )
    .all(fromSec, toSec) as { key: string }[];

  return rows.map((row) => row.key);
}

export function queryIndexedBubblesInRange(
  fromSec: number,
  toSec: number,
  vscdbPath: string,
): GlobalBubbleStub[] {
  if (!isCursorBubbleIndexReady(vscdbPath)) return [];

  const rows = getIndexDatabase()
    .prepare(
      `SELECT composer_id, created_at_sec, bubble_type
       FROM bubble_index
       WHERE created_at_sec >= ? AND created_at_sec <= ?
       ORDER BY created_at_sec ASC`,
    )
    .all(fromSec, toSec) as {
    composer_id: string;
    created_at_sec: number;
    bubble_type: number;
  }[];

  return rows.map((row) => ({
    composerId: row.composer_id,
    createdAtSec: row.created_at_sec,
    bubbleType: row.bubble_type as 1 | 2,
  }));
}

/** Fallback: index seek on bubble keys, filter timestamps in JS. */
export function loadGlobalBubblesInRangeDirect(
  fromSec: number,
  toSec: number,
  dbPath: string,
): GlobalBubbleStub[] {
  const db = getReadonlyCursorDatabase(dbPath);
  if (!cursorDiskKvTableExists(db)) return [];

  const roughFrom = Math.floor(fromSec);
  const roughTo = Math.ceil(toSec);

  const select = db.prepare(
    `SELECT key, CAST(value AS TEXT) AS value
     FROM ${CURSOR_DISK_KV_TABLE}
     WHERE key >= ?
       AND key < ?`,
  );

  const stubs: GlobalBubbleStub[] = [];
  for (const row of select.iterate(BUBBLE_KEY_MIN, BUBBLE_KEY_MAX) as Iterable<{
    key: string;
    value: string;
  }>) {
    const createdAtSec = parseBubbleCreatedAtSecFromRaw(row.value);
    if (createdAtSec == null || createdAtSec < roughFrom || createdAtSec > roughTo) {
      continue;
    }
    const parsed = parseBubbleRow(row.key, row.value);
    if (parsed) stubs.push(parsed);
  }
  return stubs;
}

export async function loadGlobalBubblesInRangeDirectAsync(
  fromSec: number,
  toSec: number,
  dbPath: string,
): Promise<GlobalBubbleStub[]> {
  const db = getReadonlyCursorDatabase(dbPath);
  if (!cursorDiskKvTableExists(db)) return [];

  const roughFrom = Math.floor(fromSec);
  const roughTo = Math.ceil(toSec);

  const select = db.prepare(
    `SELECT key, CAST(value AS TEXT) AS value
     FROM ${CURSOR_DISK_KV_TABLE}
     WHERE key >= ?
       AND key < ?`,
  );

  const stubs: GlobalBubbleStub[] = [];
  let scanned = 0;
  for (const row of select.iterate(BUBBLE_KEY_MIN, BUBBLE_KEY_MAX) as Iterable<{
    key: string;
    value: string;
  }>) {
    scanned += 1;
    const createdAtSec = parseBubbleCreatedAtSecFromRaw(row.value);
    if (createdAtSec == null || createdAtSec < roughFrom || createdAtSec > roughTo) {
      if (scanned % 2000 === 0) await yieldEventLoop();
      continue;
    }
    const parsed = parseBubbleRow(row.key, row.value);
    if (parsed) stubs.push(parsed);
    if (scanned % 2000 === 0) await yieldEventLoop();
  }
  return stubs;
}

export function loadGlobalBubblesForAttach(
  fromSec: number,
  toSec: number,
  vscdbPath: string,
  options?: { fastPath?: boolean },
): GlobalBubbleStub[] {
  const roughFrom = Math.floor(fromSec);
  const roughTo = Math.ceil(toSec);
  const fastPath = options?.fastPath !== false;

  if (isCursorBubbleIndexReady(vscdbPath)) {
    return queryIndexedBubblesInRange(roughFrom, roughTo, vscdbPath);
  }

  if (fastPath) {
    const viaHeaders = loadGlobalBubblesViaComposerHeaders(
      roughFrom,
      roughTo,
      vscdbPath,
    );
    if (viaHeaders.length > 0) {
      scheduleCursorBubbleIndexBuild(vscdbPath);
      return viaHeaders;
    }
  }

  const direct = loadGlobalBubblesInRangeDirect(roughFrom, roughTo, vscdbPath);
  scheduleCursorBubbleIndexBuild(vscdbPath);
  return direct;
}

export async function loadGlobalBubblesForAttachAsync(
  fromSec: number,
  toSec: number,
  vscdbPath: string,
  options?: { fastPath?: boolean },
): Promise<GlobalBubbleStub[]> {
  const roughFrom = Math.floor(fromSec);
  const roughTo = Math.ceil(toSec);
  const fastPath = options?.fastPath !== false;

  if (isCursorBubbleIndexReady(vscdbPath)) {
    return queryIndexedBubblesInRange(roughFrom, roughTo, vscdbPath);
  }

  if (fastPath) {
    const viaHeaders = loadGlobalBubblesViaComposerHeaders(
      roughFrom,
      roughTo,
      vscdbPath,
    );
    if (viaHeaders.length > 0) {
      scheduleCursorBubbleIndexBuild(vscdbPath);
      return viaHeaders;
    }
  }

  const direct = await loadGlobalBubblesInRangeDirectAsync(roughFrom, roughTo, vscdbPath);
  scheduleCursorBubbleIndexBuild(vscdbPath);
  return direct;
}
