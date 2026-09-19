/**
 * Cursor composer trace index → `.data/cursor-trace.db`
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { getDataDir } from "@/lib/claude/path";
import { projectLabelsFromPath } from "@/lib/cursor/project-attribution";
import {
  loadComposerProjectMap,
  resolveComposerProjectPath,
} from "@/lib/cursor/project-attribution";
import {
  loadComposerBubblesInRange,
  loadTaskV2DispatchBubbles,
} from "@/lib/cursor/vscdb-bubbles";
import { cursorVscdbExists, getResolvedVscdbPath } from "@/lib/cursor/path";
import {
  composerBubbleKeyRange,
  CURSOR_DISK_KV_TABLE,
  getReadonlyCursorDatabase,
} from "@/lib/cursor/vscdb";
import { readSettings, resolveTraceMode } from "@/lib/profile/settings";
import { getLastProviderImportAt } from "@/lib/cursor/provider-usage-db";
import { estimateInteractionApiCostUsd } from "@/lib/cursor/trace/interaction-cost";
import { applyInteractionModelCarryForward } from "@/lib/cursor/trace/interaction-model";
import { parseComposerFromDb } from "@/lib/cursor/trace/composer-parse";
import { extractAllSpawnedComposerIds } from "@/lib/cursor/trace/subagent-dispatch";
import type { ParsedCursorComposer } from "@/lib/cursor/trace/types";
import type {
  TraceSubagentBranchMeta,
  TraceTimelinePart,
} from "@/lib/tracing-shared";

export const CURSOR_UNALLOCATED_PATH = "__unallocated__";

let conn: Database.Database | null = null;

function dbPath(): string {
  return path.join(getDataDir(), "cursor-trace.db");
}

export function getCursorTraceDatabase(): Database.Database {
  if (conn) return conn;
  fs.mkdirSync(getDataDir(), { recursive: true });
  conn = new Database(dbPath());
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS cursor_trace_sessions (
      composer_id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL DEFAULT '',
      workspace_id TEXT,
      session_name TEXT,
      started_sec REAL,
      last_request_sec REAL,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      user_request_count INTEGER NOT NULL DEFAULT 0,
      model_label TEXT,
      cost_usd REAL,
      source_hash TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_cursor_trace_sessions_project
      ON cursor_trace_sessions (project_path);
    CREATE INDEX IF NOT EXISTS idx_cursor_trace_sessions_last
      ON cursor_trace_sessions (last_request_sec);

    CREATE TABLE IF NOT EXISTS cursor_trace_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      composer_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      started_sec REAL,
      ended_sec REAL,
      request_count INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      tool_summary_json TEXT,
      cost_usd REAL,
      interaction_mode TEXT,
      reverted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cursor_trace_interactions_session
      ON cursor_trace_interactions (composer_id, idx);

    CREATE TABLE IF NOT EXISTS cursor_trace_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      composer_id TEXT NOT NULL,
      interaction_idx INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      bubble_key TEXT,
      bubble_id TEXT,
      role TEXT NOT NULL,
      is_subagent INTEGER NOT NULL DEFAULT 0,
      parent_dispatch_bubble_key TEXT,
      model TEXT,
      created_sec REAL,
      context_pct REAL,
      content_json TEXT NOT NULL DEFAULT '[]',
      attached_context_json TEXT NOT NULL DEFAULT '[]',
      preview TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cursor_trace_requests_session_interaction
      ON cursor_trace_requests (composer_id, interaction_idx, seq);

    CREATE TABLE IF NOT EXISTS cursor_trace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return conn;
}

function metaGet(key: string): string | null {
  const row = getCursorTraceDatabase()
    .prepare(`SELECT value FROM cursor_trace_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function metaSet(key: string, value: string): void {
  getCursorTraceDatabase()
    .prepare(
      `INSERT INTO cursor_trace_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

function vscdbMtimeMs(vscdbPath: string): number {
  try {
    return fs.statSync(vscdbPath).mtimeMs;
  } catch {
    return 0;
  }
}

/** Fingerprint of one composer's bubble payload — not global vscdb mtime (that would re-index everything on every Cursor edit). */
function composerContentFingerprint(
  db: Database.Database,
  composerId: string,
): string {
  const { min, max } = composerBubbleKeyRange(composerId);
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM ${CURSOR_DISK_KV_TABLE} WHERE key >= ? AND key < ?`,
    )
    .get(min, max) as { c: number };
  const dataRow = db
    .prepare(`SELECT CAST(value AS TEXT) AS value FROM ${CURSOR_DISK_KV_TABLE} WHERE key = ?`)
    .get(`composerData:${composerId}`) as { value: string } | undefined;
  const len = dataRow?.value?.length ?? 0;
  return `${countRow.c}:${len}`;
}

function storedComposerHashMatches(
  stored: string | null | undefined,
  fingerprint: string,
): boolean {
  if (!stored) return false;
  if (stored === fingerprint) return true;
  // Legacy rows stored `count:len:vscdbMtime` or with CSV epoch suffixes.
  return stored.startsWith(`${fingerprint}:`);
}

/** Bump when interaction cost attribution logic changes (triggers one-time backfill). */
const CURSOR_TRACE_COST_ALGO = "composer-bubble-v1";

let cursorTraceCostRefreshInFlight = false;

const SPAWNED_CHILD_IDS_META = "spawned_child_composer_ids_json";
const SPAWNED_CHILD_VSCDB_MTIME_META = "spawned_child_vscdb_mtime_ms";

function loadPersistedSpawnedChildSet(vscdbPath: string): Set<string> | null {
  const mtime = vscdbMtimeMs(vscdbPath);
  const storedMtime = metaGet(SPAWNED_CHILD_VSCDB_MTIME_META);
  if (storedMtime !== String(mtime)) return null;
  const raw = metaGet(SPAWNED_CHILD_IDS_META);
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return null;
    return new Set(ids.filter((id): id is string => typeof id === "string"));
  } catch {
    return null;
  }
}

function persistSpawnedChildSet(vscdbPath: string, set: Set<string>): void {
  metaSet(SPAWNED_CHILD_IDS_META, JSON.stringify([...set]));
  metaSet(SPAWNED_CHILD_VSCDB_MTIME_META, String(vscdbMtimeMs(vscdbPath)));
}

/** Recompute interaction/session costs from provider CSV (after upload or attribution). */
export function refreshCursorTraceCostsFromProviderCsv(): {
  sessionsUpdated: number;
  interactionsUpdated: number;
} {
  const traceDb = getCursorTraceDatabase();
  const sessions = traceDb
    .prepare(`SELECT composer_id FROM cursor_trace_sessions`)
    .all() as { composer_id: string }[];

  let sessionsUpdated = 0;
  let interactionsUpdated = 0;

  const updateInteraction = traceDb.prepare(
    `UPDATE cursor_trace_interactions SET cost_usd = ? WHERE composer_id = ? AND idx = ?`,
  );
  const updateSession = traceDb.prepare(
    `UPDATE cursor_trace_sessions SET cost_usd = ? WHERE composer_id = ?`,
  );

  for (const { composer_id: composerId } of sessions) {
    const interactions = traceDb
      .prepare(
        `SELECT idx, started_sec AS startedSec, ended_sec AS endedSec
         FROM cursor_trace_interactions WHERE composer_id = ? ORDER BY idx`,
      )
      .all(composerId) as {
      idx: number;
      startedSec: number | null;
      endedSec: number | null;
    }[];

    const sessionRange = traceDb
      .prepare(
        `SELECT MIN(started_sec) AS minSec,
                MAX(COALESCE(ended_sec, started_sec)) AS maxSec
         FROM cursor_trace_interactions WHERE composer_id = ?`,
      )
      .get(composerId) as { minSec: number | null; maxSec: number | null };

    const composerBubbles =
      sessionRange.minSec != null && sessionRange.maxSec != null
        ? loadComposerBubblesInRange(
            composerId,
            sessionRange.minSec,
            sessionRange.maxSec,
          )
        : [];

    let totalCost: number | null = null;
    for (const intr of interactions) {
      const cost = estimateInteractionApiCostUsd(
        composerId,
        intr.startedSec,
        intr.endedSec,
        { composerBubbles },
      );
      updateInteraction.run(cost, composerId, intr.idx);
      interactionsUpdated += 1;
      if (cost != null) totalCost = (totalCost ?? 0) + cost;
    }
    updateSession.run(totalCost, composerId);
    sessionsUpdated += 1;
  }

  metaSet("provider_usage_cost_epoch", getLastProviderImportAt() ?? "0");
  metaSet("provider_usage_cost_algo", CURSOR_TRACE_COST_ALGO);
  return { sessionsUpdated, interactionsUpdated };
}

/** Apply provider CSV costs when imports changed since the last backfill. */
export function ensureCursorTraceCostsFresh(): void {
  const current = getLastProviderImportAt();
  if (!current) return;
  const storedEpoch = metaGet("provider_usage_cost_epoch");
  const storedAlgo = metaGet("provider_usage_cost_algo");
  if (storedEpoch === current && storedAlgo === CURSOR_TRACE_COST_ALGO) return;
  if (cursorTraceCostRefreshInFlight) return;
  cursorTraceCostRefreshInFlight = true;
  try {
    refreshCursorTraceCostsFromProviderCsv();
  } finally {
    cursorTraceCostRefreshInFlight = false;
  }
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Yields periodically so dev server stays responsive during large backfills. */
async function refreshCursorTraceCostsFromProviderCsvAsync(): Promise<void> {
  const current = getLastProviderImportAt();
  if (!current) return;
  const storedEpoch = metaGet("provider_usage_cost_epoch");
  const storedAlgo = metaGet("provider_usage_cost_algo");
  if (storedEpoch === current && storedAlgo === CURSOR_TRACE_COST_ALGO) return;
  if (cursorTraceCostRefreshInFlight) return;
  cursorTraceCostRefreshInFlight = true;
  try {
    const traceDb = getCursorTraceDatabase();
    const sessions = traceDb
      .prepare(`SELECT composer_id FROM cursor_trace_sessions`)
      .all() as { composer_id: string }[];

    const updateInteraction = traceDb.prepare(
      `UPDATE cursor_trace_interactions SET cost_usd = ? WHERE composer_id = ? AND idx = ?`,
    );
    const updateSession = traceDb.prepare(
      `UPDATE cursor_trace_sessions SET cost_usd = ? WHERE composer_id = ?`,
    );

    for (let s = 0; s < sessions.length; s++) {
      const composerId = sessions[s]!.composer_id;
      const interactions = traceDb
        .prepare(
          `SELECT idx, started_sec AS startedSec, ended_sec AS endedSec
           FROM cursor_trace_interactions WHERE composer_id = ? ORDER BY idx`,
        )
        .all(composerId) as {
        idx: number;
        startedSec: number | null;
        endedSec: number | null;
      }[];

      const sessionRange = traceDb
        .prepare(
          `SELECT MIN(started_sec) AS minSec,
                  MAX(COALESCE(ended_sec, started_sec)) AS maxSec
           FROM cursor_trace_interactions WHERE composer_id = ?`,
        )
        .get(composerId) as { minSec: number | null; maxSec: number | null };

      const composerBubbles =
        sessionRange.minSec != null && sessionRange.maxSec != null
          ? loadComposerBubblesInRange(
              composerId,
              sessionRange.minSec,
              sessionRange.maxSec,
            )
          : [];

      let totalCost: number | null = null;
      for (const intr of interactions) {
        const cost = estimateInteractionApiCostUsd(
          composerId,
          intr.startedSec,
          intr.endedSec,
          { composerBubbles },
        );
        updateInteraction.run(cost, composerId, intr.idx);
        if (cost != null) totalCost = (totalCost ?? 0) + cost;
      }
      updateSession.run(totalCost, composerId);

      if ((s + 1) % 12 === 0) await yieldEventLoop();
    }

    metaSet("provider_usage_cost_epoch", current);
    metaSet("provider_usage_cost_algo", CURSOR_TRACE_COST_ALGO);
  } finally {
    cursorTraceCostRefreshInFlight = false;
  }
}

/** Run CSV cost backfill off the HTTP critical path (after trace sync finalize, upload, etc.). */
export function scheduleCursorTraceCostRefresh(): void {
  setImmediate(() => {
    void refreshCursorTraceCostsFromProviderCsvAsync();
  });
}

let spawnedChildCache: {
  vscdbPath: string;
  vscdbMtime: number;
  set: Set<string>;
} | null = null;

function buildSpawnedChildSetCached(vscdbPath: string): Set<string> {
  const mtime = vscdbMtimeMs(vscdbPath);
  if (
    spawnedChildCache &&
    spawnedChildCache.vscdbPath === vscdbPath &&
    spawnedChildCache.vscdbMtime === mtime
  ) {
    return spawnedChildCache.set;
  }
  const persisted = loadPersistedSpawnedChildSet(vscdbPath);
  if (persisted) {
    spawnedChildCache = { vscdbPath, vscdbMtime: mtime, set: persisted };
    return persisted;
  }
  const set = buildSpawnedChildSet(vscdbPath);
  persistSpawnedChildSet(vscdbPath, set);
  spawnedChildCache = { vscdbPath, vscdbMtime: mtime, set };
  return set;
}

/** Plan / read paths: never scan vscdb for task_v2; sync chunks rebuild when needed. */
function spawnedChildSetForPlan(vscdbPath: string): Set<string> {
  const mtime = vscdbMtimeMs(vscdbPath);
  if (
    spawnedChildCache &&
    spawnedChildCache.vscdbPath === vscdbPath &&
    spawnedChildCache.vscdbMtime === mtime
  ) {
    return spawnedChildCache.set;
  }
  return loadPersistedSpawnedChildSet(vscdbPath) ?? new Set();
}

function deleteComposerRows(db: Database.Database, composerId: string): void {
  db.prepare(`DELETE FROM cursor_trace_requests WHERE composer_id = ?`).run(composerId);
  db.prepare(`DELETE FROM cursor_trace_interactions WHERE composer_id = ?`).run(composerId);
  db.prepare(`DELETE FROM cursor_trace_sessions WHERE composer_id = ?`).run(composerId);
}

function indexParsedComposer(
  db: Database.Database,
  parsed: ParsedCursorComposer,
  sourceHash: string,
): void {
  deleteComposerRows(db, parsed.composerId);
  let totalCost: number | null = null;
  let seq = 0;

  for (const interaction of parsed.interactions) {
    db.prepare(
      `INSERT INTO cursor_trace_interactions
         (composer_id, idx, started_sec, ended_sec, request_count, model,
          tool_summary_json, cost_usd, interaction_mode, reverted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      parsed.composerId,
      interaction.idx,
      interaction.startedSec,
      interaction.endedSec,
      interaction.requestCount,
      interaction.model,
      JSON.stringify(interaction.toolSummary),
      interaction.costUsd,
      interaction.interactionMode,
      interaction.reverted ? 1 : 0,
    );
    if (interaction.costUsd != null) {
      totalCost = (totalCost ?? 0) + interaction.costUsd;
    }

    const insertRequest = (row: ParsedCursorComposer["requests"][0], isSubagent: boolean, parentKey: string | null) => {
      db.prepare(
        `INSERT INTO cursor_trace_requests (
          composer_id, interaction_idx, seq, bubble_key, bubble_id, role,
          is_subagent, parent_dispatch_bubble_key, model, created_sec,
          context_pct, content_json, attached_context_json, preview
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        parsed.composerId,
        interaction.idx,
        seq++,
        row.bubbleKey,
        row.bubbleId,
        row.role,
        isSubagent ? 1 : 0,
        parentKey,
        row.model,
        row.createdAtSec,
        row.contextPct,
        JSON.stringify(row.content),
        JSON.stringify(row.attachedContext),
        row.preview,
      );
      if (row.subagentBranch && row.dispatch) {
        for (const childRow of row.subagentBranch.requests) {
          insertRequest(childRow, true, row.bubbleKey);
        }
      }
    };

    for (const row of interaction.requests) {
      insertRequest(row, false, null);
    }
  }

  const projectPath = parsed.projectPath?.trim() || CURSOR_UNALLOCATED_PATH;
  db.prepare(
    `INSERT INTO cursor_trace_sessions (
       composer_id, project_path, workspace_id, session_name, started_sec,
       last_request_sec, interaction_count, request_count, user_request_count,
       model_label, cost_usd, source_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    parsed.composerId,
    projectPath,
    parsed.workspaceId,
    parsed.composerName,
    parsed.startedAtSec,
    parsed.lastRequestAtSec,
    parsed.interactions.length,
    parsed.requests.length,
    parsed.userRequestCount,
    parsed.interactions.find((i) => i.model)?.model ?? null,
    totalCost,
    sourceHash,
  );
}

function buildSpawnedChildSet(vscdbPath: string): Set<string> {
  const out = new Set<string>();
  for (const dispatch of loadTaskV2DispatchBubbles(vscdbPath)) {
    for (const id of extractAllSpawnedComposerIds(dispatch.raw)) {
      out.add(id);
    }
  }
  return out;
}

function listComposerIds(vscdbPath: string): string[] {
  const map = loadComposerProjectMap(vscdbPath);
  return [...map.keys()];
}

function parseComposerWithSubagents(
  vscdb: Database.Database,
  composerId: string,
  projectPath: string | null,
  cache: Map<string, ParsedCursorComposer | null>,
  vscdbPath: string,
  depth = 0,
): ParsedCursorComposer | null {
  if (depth > 4) return null;
  if (cache.has(composerId)) return cache.get(composerId) ?? null;

  const parsed = parseComposerFromDb(vscdb, composerId, projectPath, {
    vscdbPath,
    parseSubagent: (childId) => {
      const childPath =
        resolveComposerProjectPath(vscdb, childId, new Map(), new Map()) ??
        projectPath;
      return parseComposerWithSubagents(
        vscdb,
        childId,
        childPath,
        cache,
        vscdbPath,
        depth + 1,
      );
    },
  });
  cache.set(composerId, parsed);
  return parsed;
}

function syncOneComposer(
  vscdb: Database.Database,
  traceDb: Database.Database,
  composerId: string,
  projectPath: string | null,
  spawnedChildren: Set<string>,
  vscdbMtime: number,
  vscdbPath: string,
  knownFingerprint?: string,
): boolean {
  const fingerprint =
    knownFingerprint ?? composerContentFingerprint(vscdb, composerId);
  if (spawnedChildren.has(composerId)) {
    markComposerTraceSkipped(traceDb, composerId, projectPath, fingerprint);
    return false;
  }
  const existing = traceDb
    .prepare(`SELECT source_hash FROM cursor_trace_sessions WHERE composer_id = ?`)
    .get(composerId) as { source_hash: string } | undefined;
  if (storedComposerHashMatches(existing?.source_hash, fingerprint)) return false;

  const cache = new Map<string, ParsedCursorComposer | null>();
  const parsed = parseComposerWithSubagents(
    vscdb,
    composerId,
    projectPath,
    cache,
    vscdbPath,
  );
  if (!parsed) {
    markComposerTraceSkipped(traceDb, composerId, projectPath, fingerprint);
    return false;
  }

  const run = traceDb.transaction(() => {
    indexParsedComposer(traceDb, parsed, fingerprint);
  });
  run();
  return true;
}

/** Persist hash for header-only / bubble-less composers so sync chunks can finish. */
function markComposerTraceSkipped(
  traceDb: Database.Database,
  composerId: string,
  projectPath: string | null,
  sourceHash: string,
): void {
  const project = projectPath?.trim() || CURSOR_UNALLOCATED_PATH;
  traceDb
    .prepare(
      `INSERT INTO cursor_trace_sessions (
         composer_id, project_path, source_hash,
         interaction_count, request_count, user_request_count
       ) VALUES (?, ?, ?, 0, 0, 0)
       ON CONFLICT(composer_id) DO UPDATE SET
         project_path = excluded.project_path,
         source_hash = excluded.source_hash`,
    )
    .run(composerId, project, sourceHash);
}

export type CursorTraceSyncResult = {
  composersScanned: number;
  composersIndexed: number;
  remainingChanged?: number;
  changedProcessed?: number;
  skipped?: boolean;
};

export const DEFAULT_CURSOR_TRACE_SYNC_CHUNK = 4;

export function ensureCursorTraceSynced(): Promise<CursorTraceSyncResult> {
  if (resolveTraceMode("cursor") !== "full_tracing") {
    return Promise.resolve({ composersScanned: 0, composersIndexed: 0, skipped: true });
  }
  const vscdbPath = getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
  if (!cursorVscdbExists(vscdbPath)) {
    return Promise.resolve({ composersScanned: 0, composersIndexed: 0, skipped: true });
  }
  const mtime = vscdbMtimeMs(vscdbPath);
  const watermark = Number.parseFloat(metaGet("vscdb_mtime_watermark") ?? "0");
  if (mtime <= watermark) {
    return Promise.resolve({ composersScanned: 0, composersIndexed: 0, skipped: true });
  }
  return syncAllCursorTrace();
}

let ensurePromise: Promise<CursorTraceSyncResult> | null = null;

function syncAllCursorTrace(): Promise<CursorTraceSyncResult> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const vscdbPath = getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
    if (!cursorVscdbExists(vscdbPath)) {
      return { composersScanned: 0, composersIndexed: 0 };
    }
    const vscdb = getReadonlyCursorDatabase(vscdbPath);
    const traceDb = getCursorTraceDatabase();
    const vscdbMtime = vscdbMtimeMs(vscdbPath);
    const spawned = buildSpawnedChildSetCached(vscdbPath);
    const projectMap = loadComposerProjectMap(vscdbPath);
    let indexed = 0;
    for (const [composerId, projectPath] of projectMap) {
      if (
        syncOneComposer(
          vscdb,
          traceDb,
          composerId,
          projectPath,
          spawned,
          vscdbMtime,
          vscdbPath,
        )
      ) {
        indexed += 1;
      }
    }
    metaSet("vscdb_mtime_watermark", String(vscdbMtimeMs(vscdbPath)));
    return { composersScanned: projectMap.size, composersIndexed: indexed };
  })().finally(() => {
    ensurePromise = null;
  });
  return ensurePromise;
}

export type CursorTraceSyncPlanProject = {
  projectPath: string;
  projectName: string;
  changedComposers: number;
  totalComposers: number;
};

export type CursorTraceSyncPlan = {
  projects: CursorTraceSyncPlanProject[];
  totalChangedComposers: number;
};

export function planCursorTraceSync(): CursorTraceSyncPlan {
  const vscdbPath = getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
  if (!cursorVscdbExists(vscdbPath)) {
    return { projects: [], totalChangedComposers: 0 };
  }
  const vscdbMtime = vscdbMtimeMs(vscdbPath);
  const vscdb = getReadonlyCursorDatabase(vscdbPath);
  const traceDb = getCursorTraceDatabase();
  const projectMap = loadComposerProjectMap(vscdbPath, { scanWorkspaces: false });
  const known = new Map(
    (
      traceDb
        .prepare(`SELECT composer_id, source_hash FROM cursor_trace_sessions`)
        .all() as { composer_id: string; source_hash: string }[]
    ).map((row) => [row.composer_id, row.source_hash]),
  );
  const watermark = Number.parseFloat(metaGet("vscdb_mtime_watermark") ?? "0");
  const needPerComposerHash = known.size > 0 && vscdbMtime > watermark;
  const spawned = spawnedChildSetForPlan(vscdbPath);

  const byProject = new Map<string, { changed: number; total: number }>();

  for (const [composerId, projectPath] of projectMap) {
    if (spawned.has(composerId)) continue;
    const pathKey = projectPath.trim() || CURSOR_UNALLOCATED_PATH;
    const bucket = byProject.get(pathKey) ?? { changed: 0, total: 0 };
    bucket.total += 1;
    let changed = false;
    if (known.size === 0) {
      changed = true;
    } else if (!needPerComposerHash) {
      changed = !known.has(composerId);
    } else {
      // Defer per-composer fingerprints to sync chunks (~20s if done here).
      changed = true;
    }
    if (changed) bucket.changed += 1;
    byProject.set(pathKey, bucket);
  }

  const projects = [...byProject.entries()]
    .map(([projectPath, counts]) => ({
      projectPath,
      projectName: projectLabelsFromPath(
        projectPath === CURSOR_UNALLOCATED_PATH ? null : projectPath,
      ).label,
      changedComposers: counts.changed,
      totalComposers: counts.total,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  const totalChangedComposers = projects.reduce(
    (s, p) => s + p.changedComposers,
    0,
  );
  if (totalChangedComposers === 0 && vscdbMtime > watermark) {
    metaSet("vscdb_mtime_watermark", String(vscdbMtime));
  }

  return {
    projects,
    totalChangedComposers,
  };
}

export function syncCursorTraceProject(
  projectPath: string,
  options?: { limit?: number },
): CursorTraceSyncResult {
  const vscdbPath = getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
  if (!cursorVscdbExists(vscdbPath)) {
    return { composersScanned: 0, composersIndexed: 0, remainingChanged: 0 };
  }
  const limit = options?.limit ?? Number.POSITIVE_INFINITY;
  const vscdbMtime = vscdbMtimeMs(vscdbPath);
  const vscdb = getReadonlyCursorDatabase(vscdbPath);
  const traceDb = getCursorTraceDatabase();
  const projectMap = loadComposerProjectMap(vscdbPath);
  const composersForProject = [...projectMap.entries()].filter(
    ([, path]) => (path.trim() || CURSOR_UNALLOCATED_PATH) === projectPath,
  );
  const scanned = composersForProject.length;

  type PendingComposer = {
    composerId: string;
    path: string;
    hash: string;
  };
  const spawned = buildSpawnedChildSetCached(vscdbPath);
  const pending: PendingComposer[] = [];
  for (const [composerId, path] of composersForProject) {
    const fingerprint = composerContentFingerprint(vscdb, composerId);
    const existing = traceDb
      .prepare(`SELECT source_hash FROM cursor_trace_sessions WHERE composer_id = ?`)
      .get(composerId) as { source_hash: string } | undefined;
    if (storedComposerHashMatches(existing?.source_hash, fingerprint)) continue;
    if (spawned.has(composerId)) {
      markComposerTraceSkipped(traceDb, composerId, path, fingerprint);
      continue;
    }
    pending.push({ composerId, path, hash: fingerprint });
  }

  if (pending.length === 0) {
    return {
      composersScanned: scanned,
      composersIndexed: 0,
      remainingChanged: 0,
      changedProcessed: 0,
    };
  }
  let indexed = 0;
  let changedProcessed = 0;

  for (const { composerId, path, hash } of pending) {
    if (changedProcessed >= limit) break;
    try {
      if (
        syncOneComposer(
          vscdb,
          traceDb,
          composerId,
          path,
          spawned,
          vscdbMtime,
          vscdbPath,
          hash,
        )
      ) {
        indexed += 1;
      }
    } catch (error) {
      console.error(`[cursor-trace-db] Failed composer ${composerId}:`, error);
    }
    changedProcessed += 1;
  }

  let remainingAfter = 0;
  for (const [composerId, path] of composersForProject) {
    if (spawned.has(composerId)) continue;
    const fingerprint = composerContentFingerprint(vscdb, composerId);
    const existing = traceDb
      .prepare(`SELECT source_hash FROM cursor_trace_sessions WHERE composer_id = ?`)
      .get(composerId) as { source_hash: string } | undefined;
    if (!storedComposerHashMatches(existing?.source_hash, fingerprint)) {
      remainingAfter += 1;
    }
  }

  return {
    composersScanned: scanned,
    composersIndexed: indexed,
    remainingChanged: remainingAfter,
    changedProcessed,
  };
}

export function finalizeCursorTraceSync(): void {
  const vscdbPath = getResolvedVscdbPath(readSettings().vscdbPathOverride ?? null);
  if (cursorVscdbExists(vscdbPath)) {
    metaSet("vscdb_mtime_watermark", String(vscdbMtimeMs(vscdbPath)));
    const pathForSpawned = vscdbPath;
    setImmediate(() => {
      const set = buildSpawnedChildSet(pathForSpawned);
      persistSpawnedChildSet(pathForSpawned, set);
      spawnedChildCache = {
        vscdbPath: pathForSpawned,
        vscdbMtime: vscdbMtimeMs(pathForSpawned),
        set,
      };
    });
  }
  scheduleCursorTraceCostRefresh();
}

export type CursorTraceProjectRow = {
  projectPath: string;
  projectName: string;
  sessionCount: number;
  requestCount: number;
  lastRequestSec: number | null;
};

export function queryCursorTraceProjects(): CursorTraceProjectRow[] {
  const rows = getCursorTraceDatabase()
    .prepare(
      `SELECT project_path AS projectPath,
              COUNT(*) AS sessionCount,
              COALESCE(SUM(request_count), 0) AS requestCount,
              MAX(last_request_sec) AS lastRequestSec
       FROM cursor_trace_sessions
       GROUP BY project_path
       ORDER BY lastRequestSec DESC`,
    )
    .all() as CursorTraceProjectRow[];
  return rows.map((r) => ({
    ...r,
    projectName: projectLabelsFromPath(
      r.projectPath === CURSOR_UNALLOCATED_PATH ? null : r.projectPath,
    ).label,
  }));
}

export type CursorTraceSessionRow = {
  composerId: string;
  sessionName: string | null;
  interactionCount: number;
  requestCount: number;
  userRequestCount: number;
  modelLabel: string | null;
  costUsd: number | null;
  startedSec: number | null;
  lastRequestSec: number | null;
  projectPath: string;
};

export function queryCursorTraceSessions(options: {
  projectPath: string;
  search?: string;
  sort?: "last_request" | "created" | "most_requests";
  offset: number;
  limit: number;
}): { rows: CursorTraceSessionRow[]; total: number } {
  const db = getCursorTraceDatabase();
  const conditions = ["project_path = @projectPath"];
  const params: Record<string, string | number> = { projectPath: options.projectPath };
  if (options.search?.trim()) {
    conditions.push("(composer_id LIKE @q OR session_name LIKE @q)");
    params.q = `%${options.search.trim()}%`;
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const order =
    options.sort === "created"
      ? "ORDER BY started_sec DESC"
      : options.sort === "most_requests"
        ? "ORDER BY request_count DESC, last_request_sec DESC"
        : "ORDER BY last_request_sec DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM cursor_trace_sessions ${where}`).get(params) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT composer_id AS composerId, session_name AS sessionName,
              interaction_count AS interactionCount, request_count AS requestCount,
              user_request_count AS userRequestCount, model_label AS modelLabel,
              cost_usd AS costUsd, started_sec AS startedSec,
              last_request_sec AS lastRequestSec, project_path AS projectPath
       FROM cursor_trace_sessions ${where} ${order}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: options.limit, offset: options.offset }) as CursorTraceSessionRow[];

  return { rows, total };
}

export function getCursorTraceSession(composerId: string) {
  const db = getCursorTraceDatabase();
  const session = db
    .prepare(
      `SELECT composer_id AS composerId, project_path AS projectPath,
              session_name AS sessionName, interaction_count AS interactionCount,
              request_count AS requestCount, user_request_count AS userRequestCount,
              model_label AS modelLabel, cost_usd AS costUsd,
              started_sec AS startedSec, last_request_sec AS lastRequestSec
       FROM cursor_trace_sessions WHERE composer_id = ?`,
    )
    .get(composerId) as CursorTraceSessionRow | undefined;
  if (!session) return null;

  const interactions = (
    db
      .prepare(
        `SELECT idx, started_sec AS startedSec, ended_sec AS endedSec,
                request_count AS requestCount, model, tool_summary_json AS toolSummaryJson,
                cost_usd AS costUsd, interaction_mode AS interactionMode, reverted
         FROM cursor_trace_interactions WHERE composer_id = ? ORDER BY idx ASC`,
      )
      .all(composerId) as {
      idx: number;
      startedSec: number | null;
      endedSec: number | null;
      requestCount: number;
      model: string | null;
      toolSummaryJson: string | null;
      costUsd: number | null;
      interactionMode: string | null;
      reverted: number;
    }[]
  ).map((r) => ({
    idx: r.idx,
    startedSec: r.startedSec,
    endedSec: r.endedSec,
    requestCount: r.requestCount,
    model: r.model,
    toolSummary: r.toolSummaryJson ? (JSON.parse(r.toolSummaryJson) as { name: string; count: number }[]) : [],
    costUsd: r.costUsd,
    interactionMode: r.interactionMode,
    reverted: r.reverted === 1,
  }));

  return {
    session,
    interactions: applyInteractionModelCarryForward(interactions),
  };
}

type CursorRequestDbRow = {
  id: number;
  role: "User" | "Agent";
  bubbleKey: string | null;
  parentDispatchBubbleKey: string | null;
  isSubagent: number;
  model: string | null;
  createdSec: number | null;
  preview: string | null;
  contentJson: string;
};

function explodeCursorRow(row: CursorRequestDbRow, subagentByParent: Map<string, TraceSubagentBranchMeta>): TraceTimelinePart[] {
  let content: { kind: string; name?: string; toolCallId?: string | null }[] = [];
  try {
    content = JSON.parse(row.contentJson) as typeof content;
  } catch {
    /* ignore */
  }
  const id = row.id;
  const createdSec = row.createdSec;
  if (row.role === "User") {
    return [
      {
        timelineId: `${id}#text`,
        requestId: id,
        role: "User",
        kind: "text",
        kindLabel: "text",
        createdSec,
        textPreview: row.preview,
        toolUseId: null,
        subagent: null,
      },
    ];
  }
  const parts: TraceTimelinePart[] = [];
  let idx = 0;
  for (const part of content) {
    if (part.kind === "text") {
      parts.push({
        timelineId: `${id}#text:${idx}`,
        requestId: id,
        role: "Agent",
        kind: "text",
        kindLabel: "text",
        createdSec,
        textPreview: null,
        toolUseId: null,
        subagent: null,
      });
    } else if (part.kind === "thinking") {
      parts.push({
        timelineId: `${id}#thinking:${idx}`,
        requestId: id,
        role: "Agent",
        kind: "thinking",
        kindLabel: "thinking",
        createdSec,
        textPreview: null,
        toolUseId: null,
        subagent: null,
      });
    } else if (part.kind === "tool") {
      const name = part.name ?? "tool";
      const tid = part.toolCallId ?? `i${idx}`;
      if (name === "task_v2") {
        const branch = row.bubbleKey
          ? subagentByParent.get(row.bubbleKey) ?? null
          : null;
        parts.push({
          timelineId: `${id}#dispatch:${tid}`,
          requestId: id,
          role: "Agent",
          kind: "dispatch",
          kindLabel: branch?.label ?? "Subagent",
          createdSec,
          textPreview: null,
          toolUseId: tid,
          subagent: branch,
        });
      } else {
        parts.push({
          timelineId: `${id}#tool:${tid}`,
          requestId: id,
          role: "Agent",
          kind: "tool",
          kindLabel: name,
          createdSec,
          textPreview: null,
          toolUseId: tid,
          subagent: null,
        });
      }
    }
    idx += 1;
  }
  if (parts.length === 0) {
    parts.push({
      timelineId: `${id}#row`,
      requestId: id,
      role: "Agent",
      kind: "text",
      kindLabel: "text",
      createdSec,
      textPreview: null,
      toolUseId: null,
      subagent: null,
    });
  }
  return parts;
}

export function listCursorInteractionRequests(
  composerId: string,
  interactionIdx: number,
): TraceTimelinePart[] {
  const rows = getCursorTraceDatabase()
    .prepare(
      `SELECT id, role, bubble_key AS bubbleKey, parent_dispatch_bubble_key AS parentDispatchBubbleKey,
              is_subagent AS isSubagent, model, created_sec AS createdSec, preview, content_json AS contentJson
       FROM cursor_trace_requests
       WHERE composer_id = ? AND interaction_idx = ?
       ORDER BY seq ASC`,
    )
    .all(composerId, interactionIdx) as CursorRequestDbRow[];

  const childrenByParent = new Map<string, CursorRequestDbRow[]>();
  for (const r of rows) {
    if (r.isSubagent && r.parentDispatchBubbleKey) {
      const list = childrenByParent.get(r.parentDispatchBubbleKey) ?? [];
      list.push(r);
      childrenByParent.set(r.parentDispatchBubbleKey, list);
    }
  }

  const emptyBranches = new Map<string, TraceSubagentBranchMeta>();
  const subagentByParent = new Map<string, TraceSubagentBranchMeta>();
  for (const [parentKey, childRows] of childrenByParent) {
    const parts: TraceTimelinePart[] = [];
    for (const child of childRows) parts.push(...explodeCursorRow(child, emptyBranches));
    subagentByParent.set(parentKey, {
      label: "Subagent",
      model: childRows.find((c) => c.model)?.model ?? null,
      requestCount: childRows.length,
      parts,
    });
  }

  const timeline: TraceTimelinePart[] = [];
  for (const r of rows) {
    if (r.isSubagent) continue;
    timeline.push(...explodeCursorRow(r, subagentByParent));
  }
  return timeline;
}

export function getCursorRequestBreakdown(requestId: number) {
  const row = getCursorTraceDatabase()
    .prepare(
      `SELECT id, role, model, context_pct AS contextPct, content_json AS contentJson,
              attached_context_json AS attachedContextJson
       FROM cursor_trace_requests WHERE id = ?`,
    )
    .get(requestId) as
    | {
        id: number;
        role: "User" | "Agent";
        model: string | null;
        contextPct: number | null;
        contentJson: string;
        attachedContextJson: string;
      }
    | undefined;
  if (!row) return null;

  let content: unknown[] = [];
  let attachedContext: { category: string; label: string }[] = [];
  try {
    content = JSON.parse(row.contentJson) as unknown[];
  } catch {
    /* ignore */
  }
  try {
    attachedContext = JSON.parse(row.attachedContextJson) as typeof attachedContext;
  } catch {
    /* ignore */
  }

  return {
    id: row.id,
    role: row.role,
    model: row.model,
    contextPct: row.contextPct,
    content: content.map((part) => {
      const p = part as Record<string, unknown>;
      if (p.kind === "text") return { kind: "text" as const, value: String(p.value ?? "") };
      if (p.kind === "thinking") return { kind: "thinking" as const, value: String(p.value ?? "") };
      return {
        kind: "tool_use" as const,
        toolUseId: (p.toolCallId as string | null) ?? null,
        name: String(p.name ?? "tool"),
        input: p.params ?? null,
      };
    }),
    attachedContext,
  };
}
