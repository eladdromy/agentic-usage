import { createHash } from "crypto";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import readline from "readline";

import { discoverClaudeJsonlFiles } from "@/lib/claude/discovery";
import { getDataDir } from "@/lib/claude/path";
import type { SyncResult, UsageEventRow } from "@/lib/claude/types";
import {
  costUsdFromClaudeRecord,
  parseSessionPath,
  recordTimestampSec,
  usageFromClaudeRecord,
} from "@/lib/claude/usage-from-record";
import { readSettings, syncDebounceMs, type SyncMethod } from "@/lib/profile/settings";
import { estimateClaudeUsageCostFromDb } from "@/lib/pricing/usage-cost";

let conn: Database.Database | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function dbPath(): string {
  return path.join(getDataDir(), "agentic-usage.db");
}

export function getDatabase(): Database.Database {
  if (conn) return conn;
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  conn = new Database(dbPath());
  conn.exec(`
    CREATE TABLE IF NOT EXISTS claude_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_iso TEXT NOT NULL,
      date_sec REAL NOT NULL,
      project_slug TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      input_with_cache_write INTEGER,
      input_without_cache_write INTEGER,
      cache_create_5m INTEGER,
      cache_create_1h INTEGER,
      cache_read INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost_usd REAL,
      calculated_cost_usd REAL,
      event_key TEXT NOT NULL DEFAULT '',
      file_key TEXT NOT NULL DEFAULT '',
      line_number INTEGER NOT NULL DEFAULT 0,
      row_hash TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_claude_usage_date_sec
      ON claude_usage_events (date_sec);
    CREATE INDEX IF NOT EXISTS idx_claude_usage_project
      ON claude_usage_events (project_slug);

    CREATE TABLE IF NOT EXISTS claude_usage_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return conn;
}

/** Rows with no input/cache/output tokens are excluded from indexing and queries. */
export const HAS_TOKEN_USAGE_SQL = `(
  COALESCE(input_without_cache_write, 0)
  + COALESCE(input_with_cache_write, 0)
  + COALESCE(cache_read, 0)
  + COALESCE(output_tokens, 0)
) > 0`;

/** On-demand billed cost when present, else token-based estimate. */
export const API_EQ_USD_SQL = `CASE
  WHEN COALESCE(cost_usd, 0) > 0 THEN cost_usd
  ELSE COALESCE(calculated_cost_usd, 0)
END`;

function metaGet(key: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT value FROM claude_usage_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function metaSet(key: string, value: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO claude_usage_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

function rowHashFromParts(parts: string[]): string {
  return createHash("sha256").update(parts.join("\x1f")).digest("hex");
}

type InsertRow = {
  date_iso: string;
  date_sec: number;
  project_slug: string;
  session_id: string;
  model: string;
  input_with_cache_write: number | null;
  input_without_cache_write: number | null;
  cache_create_5m: number | null;
  cache_create_1h: number | null;
  cache_read: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  calculated_cost_usd: number | null;
  event_key: string;
  file_key: string;
  line_number: number;
  row_hash: string;
};

function eventFromLine(input: {
  fileKey: string;
  lineNumber: number;
  record: Record<string, unknown>;
}): InsertRow | null {
  const parsed = usageFromClaudeRecord(input.record);
  if (!parsed) return null;

  const dateSec = recordTimestampSec(input.record);
  if (dateSec === null) return null;

  const { usage, model } = parsed;
  const inputWithout = usage.input_tokens ?? null;
  const inputWith = usage.cache_creation_input_tokens ?? null;
  const cc = usage.cache_creation ?? {};
  const cacheCreate5m = cc.ephemeral_5m_input_tokens ?? null;
  const cacheCreate1h = cc.ephemeral_1h_input_tokens ?? null;
  const cacheRead = usage.cache_read_input_tokens ?? null;
  const output = usage.output_tokens ?? null;

  if (
    (inputWithout ?? 0) === 0
    && (inputWith ?? 0) === 0
    && (cacheRead ?? 0) === 0
    && (output ?? 0) === 0
  ) {
    return null;
  }

  const total =
    (inputWithout ?? 0) + (inputWith ?? 0) + (cacheRead ?? 0) + (output ?? 0);

  const eventKey =
    typeof input.record.uuid === "string" && input.record.uuid.trim()
      ? input.record.uuid.trim()
      : `L${input.lineNumber}`;

  const costUsd = costUsdFromClaudeRecord(input.record);
  const calculatedCostUsd = estimateClaudeUsageCostFromDb({
    model,
    inputTokens: inputWithout,
    cacheWriteTokens: inputWith,
    cacheCreate5m,
    cacheCreate1h,
    cacheReadTokens: cacheRead,
    outputTokens: output,
  });

  const { projectSlug, sessionId } = parseSessionPath(
    input.fileKey,
    input.record,
  );
  const dateIso = new Date(dateSec * 1000).toISOString();

  const rowHash = rowHashFromParts([
    input.fileKey,
    String(input.lineNumber),
    eventKey,
    dateIso,
    model,
    String(inputWithout ?? ""),
    String(inputWith ?? ""),
    String(cacheRead ?? ""),
    String(output ?? ""),
  ]);

  return {
    date_iso: dateIso,
    date_sec: dateSec,
    project_slug: projectSlug,
    session_id: sessionId,
    model,
    input_with_cache_write: inputWith,
    input_without_cache_write: inputWithout,
    cache_create_5m: cacheCreate5m,
    cache_create_1h: cacheCreate1h,
    cache_read: cacheRead,
    output_tokens: output,
    total_tokens: total > 0 ? total : null,
    cost_usd: costUsd,
    calculated_cost_usd: calculatedCostUsd,
    event_key: eventKey,
    file_key: input.fileKey,
    line_number: input.lineNumber,
    row_hash: rowHash,
  };
}

async function indexJsonlFile(
  file: { fileKey: string; absolutePath: string },
  insert: Database.Statement,
): Promise<number> {
  if (!fs.existsSync(file.absolutePath)) return 0;

  const stream = fs.createReadStream(file.absolutePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  let inserted = 0;

  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let record: Record<string, unknown>;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsed)) continue;
      record = parsed;
    } catch {
      continue;
    }

    const event = eventFromLine({
      fileKey: file.fileKey,
      lineNumber,
      record,
    });
    if (!event) continue;

    const result = insert.run(event);
    if (result.changes > 0) inserted += 1;
  }

  return inserted;
}

function isSyncDebounced(): boolean {
  const settings = readSettings();
  const lastSyncAt = metaGet("last_sync_at");
  if (!lastSyncAt) return false;
  const lastMs = Date.parse(lastSyncAt);
  if (Number.isNaN(lastMs)) return false;
  return Date.now() - lastMs < syncDebounceMs(settings.syncDebounceMinutes);
}

function sourceMtimeWatermarkMs(): number {
  const lastWatermark = metaGet("source_mtime_watermark");
  return lastWatermark ? Number.parseFloat(lastWatermark) : 0;
}

function isFirstSync(): boolean {
  if (metaGet("last_sync_at") === null) return true;
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM claude_usage_events`)
    .get() as { c: number };
  return row.c === 0;
}

function resolveSyncMode(): SyncMethod {
  if (isFirstSync()) return "full";
  return readSettings().syncMethod;
}

function needsSync(): boolean {
  const lastMs = sourceMtimeWatermarkMs();
  const files = discoverClaudeJsonlFiles();
  const maxMtime = files.reduce((m, f) => Math.max(m, f.mtimeMs), 0);
  return maxMtime > lastMs;
}

export async function syncClaudeUsageFromJsonl(): Promise<SyncResult> {
  if (syncPromise) return syncPromise;
  syncPromise = runSyncClaudeUsageFromJsonl().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

let syncPromise: Promise<SyncResult> | null = null;

async function runSyncClaudeUsageFromJsonl(): Promise<SyncResult> {
  const started = Date.now();

  if (isSyncDebounced()) {
    return {
      filesScanned: 0,
      rowsInserted: 0,
      durationMs: Date.now() - started,
      skipped: true,
      skipReason: "debounce",
    };
  }

  const syncMode = resolveSyncMode();

  if (syncMode === "updates_only" && !needsSync()) {
    return {
      filesScanned: 0,
      rowsInserted: 0,
      durationMs: Date.now() - started,
      skipped: true,
      skipReason: "no_updates",
      syncMode,
    };
  }

  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO claude_usage_events (
      date_iso, date_sec, project_slug, session_id, model,
      input_with_cache_write, input_without_cache_write,
      cache_create_5m, cache_create_1h, cache_read,
      output_tokens, total_tokens, cost_usd, calculated_cost_usd,
      event_key, file_key, line_number, row_hash
    ) VALUES (
      @date_iso, @date_sec, @project_slug, @session_id, @model,
      @input_with_cache_write, @input_without_cache_write,
      @cache_create_5m, @cache_create_1h, @cache_read,
      @output_tokens, @total_tokens, @cost_usd, @calculated_cost_usd,
      @event_key, @file_key, @line_number, @row_hash
    )
  `);

  const allFiles = discoverClaudeJsonlFiles();
  const watermark = sourceMtimeWatermarkMs();
  const filesToScan =
    syncMode === "full"
      ? allFiles
      : allFiles.filter((file) => file.mtimeMs > watermark);

  let inserted = 0;
  for (const file of filesToScan) {
    inserted += await indexJsonlFile(file, insert);
  }

  const maxMtime = allFiles.reduce((m, f) => Math.max(m, f.mtimeMs), 0);
  if (maxMtime > 0) {
    metaSet("source_mtime_watermark", String(maxMtime));
  }
  metaSet("last_sync_at", new Date().toISOString());

  return {
    filesScanned: filesToScan.length,
    rowsInserted: inserted,
    durationMs: Date.now() - started,
    syncMode,
  };
}

export function ensureSynced(): Promise<SyncResult> {
  return syncClaudeUsageFromJsonl();
}

type DbRow = {
  id: number;
  date_iso: string;
  date_sec: number;
  project_slug: string;
  session_id: string;
  model: string;
  input_with_cache_write: number | null;
  input_without_cache_write: number | null;
  cache_create_5m: number | null;
  cache_create_1h: number | null;
  cache_read: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  calculated_cost_usd: number | null;
  event_key: string;
  file_key: string;
  line_number: number;
};

function mapRow(row: DbRow): UsageEventRow {
  return {
    id: row.id,
    dateIso: row.date_iso,
    dateSec: row.date_sec,
    projectSlug: row.project_slug,
    sessionId: row.session_id,
    model: row.model,
    inputWithoutCacheWrite: row.input_without_cache_write,
    inputWithCacheWrite: row.input_with_cache_write,
    cacheCreate5m: row.cache_create_5m,
    cacheCreate1h: row.cache_create_1h,
    cacheRead: row.cache_read,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    costUsd: row.cost_usd,
    calculatedCostUsd: row.calculated_cost_usd,
    eventKey: row.event_key,
    fileKey: row.file_key,
    lineNumber: row.line_number,
  };
}

export type RawSpendSort = "last_request" | "highest_spend";

export function queryDistinctRawSpendProjectSlugs(): { slug: string }[] {
  return getDatabase()
    .prepare(
      `SELECT DISTINCT project_slug AS slug FROM claude_usage_events
       WHERE ${HAS_TOKEN_USAGE_SQL} AND TRIM(project_slug) != ''
       ORDER BY slug ASC`,
    )
    .all() as { slug: string }[];
}

export function queryDistinctRawSpendModels(): { model: string }[] {
  return getDatabase()
    .prepare(
      `SELECT DISTINCT model FROM claude_usage_events
       WHERE ${HAS_TOKEN_USAGE_SQL} AND TRIM(model) != ''
       ORDER BY model ASC`,
    )
    .all() as { model: string }[];
}

export function queryRawSpendRows(options: {
  fromSec?: number;
  toSec?: number;
  projectSlug?: string;
  model?: string;
  sort: RawSpendSort;
  offset: number;
  limit: number;
}): { rows: UsageEventRow[]; total: number } {
  const conditions: string[] = [HAS_TOKEN_USAGE_SQL];
  const params: Record<string, number | string> = {};

  if (options.fromSec != null) {
    conditions.push("date_sec >= @fromSec");
    params.fromSec = options.fromSec;
  }
  if (options.toSec != null) {
    conditions.push("date_sec < @toSec");
    params.toSec = options.toSec;
  }
  if (options.projectSlug) {
    conditions.push("project_slug = @projectSlug");
    params.projectSlug = options.projectSlug;
  }
  if (options.model) {
    conditions.push("model = @model");
    params.model = options.model;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const order =
    options.sort === "highest_spend"
      ? `ORDER BY ${API_EQ_USD_SQL} DESC, date_sec DESC`
      : "ORDER BY date_sec DESC";

  const db = getDatabase();
  const totalRow = db
    .prepare(`SELECT COUNT(*) as c FROM claude_usage_events ${where}`)
    .get(params) as { c: number };

  const rows = db
    .prepare(
      `SELECT * FROM claude_usage_events ${where} ${order} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: options.limit, offset: options.offset }) as DbRow[];

  return { rows: rows.map(mapRow), total: totalRow.c };
}

export function queryMonthlySpend(month: string): {
  planWindowStart: string;
  planWindowEnd: string;
  totalApiEqvUsd: number;
  extraBilledUsd: number;
  dailySparkline: { date: string; apiEqvUsd: number }[];
} {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  const fromSec = Math.floor(start.getTime() / 1000);
  const toSec = Math.floor(end.getTime() / 1000);

  const db = getDatabase();
  const totalRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(${API_EQ_USD_SQL}), 0) AS apiEq,
         COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS extra
       FROM claude_usage_events
       WHERE date_sec >= @fromSec AND date_sec < @toSec`,
    )
    .get({ fromSec, toSec }) as { apiEq: number; extra: number };

  const dailyRows = db
    .prepare(
      `SELECT date(date_iso) as day, COALESCE(SUM(${API_EQ_USD_SQL}), 0) as total
       FROM claude_usage_events
       WHERE date_sec >= @fromSec AND date_sec < @toSec
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all({ fromSec, toSec }) as { day: string; total: number }[];

  return {
    planWindowStart: start.toISOString().slice(0, 10),
    planWindowEnd: end.toISOString().slice(0, 10),
    totalApiEqvUsd: totalRow.apiEq,
    extraBilledUsd: totalRow.extra,
    dailySparkline: dailyRows.map((r) => ({
      date: r.day,
      apiEqvUsd: r.total,
    })),
  };
}

export function getEventCount(): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM claude_usage_events`)
    .get() as { c: number };
  return row.c;
}

export function getLastSyncAt(): string | null {
  return metaGet("last_sync_at");
}

export function queryAvailableYears(): number[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(strftime('%Y', datetime(date_sec, 'unixepoch')) AS INTEGER) AS y
       FROM claude_usage_events
       ORDER BY y DESC`,
    )
    .all() as { y: number }[];

  if (rows.length === 0) {
    return [new Date().getUTCFullYear()];
  }
  return rows.map((r) => r.y);
}

export function queryYearSpendByMonth(year: number): {
  month: string;
  totalApiEqvUsd: number;
  extraBilledUsd: number;
  dailySparkline: { date: string; apiEqvUsd: number }[];
}[] {
  const fromSec = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const toSec = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);

  const db = getDatabase();
  const dailyRows = db
    .prepare(
      `SELECT date(date_iso) AS day,
              strftime('%Y-%m', datetime(date_sec, 'unixepoch')) AS month,
              COALESCE(SUM(${API_EQ_USD_SQL}), 0) AS apiEq,
              COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS extra
       FROM claude_usage_events
       WHERE date_sec >= @fromSec AND date_sec < @toSec
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all({ fromSec, toSec }) as {
    day: string;
    month: string;
    apiEq: number;
    extra: number;
  }[];

  const byMonth = new Map<
    string,
    {
      totalApiEqvUsd: number;
      extraBilledUsd: number;
      dailySparkline: { date: string; apiEqvUsd: number }[];
    }
  >();

  for (const row of dailyRows) {
    let bucket = byMonth.get(row.month);
    if (!bucket) {
      bucket = { totalApiEqvUsd: 0, extraBilledUsd: 0, dailySparkline: [] };
      byMonth.set(row.month, bucket);
    }
    bucket.totalApiEqvUsd += row.apiEq;
    bucket.extraBilledUsd += row.extra;
    bucket.dailySparkline.push({ date: row.day, apiEqvUsd: row.apiEq });
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = `${currentYear}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (year === currentYear && !byMonth.has(currentMonth)) {
    byMonth.set(currentMonth, {
      totalApiEqvUsd: 0,
      extraBilledUsd: 0,
      dailySparkline: [],
    });
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, data]) => ({
      month,
      totalApiEqvUsd: data.totalApiEqvUsd,
      extraBilledUsd: data.extraBilledUsd,
      dailySparkline: data.dailySparkline,
    }));
}

export type ClaudeProjectBreakdownRow = {
  projectSlug: string;
  apiEqUsd: number;
  requestCount: number;
  estimateCount: number;
  firstActivitySec: number;
  lastActivitySec: number;
};

export function queryClaudeProjectBreakdown(): ClaudeProjectBreakdownRow[] {
  return getDatabase()
    .prepare(
      `SELECT
         project_slug AS projectSlug,
         COALESCE(SUM(${API_EQ_USD_SQL}), 0) AS apiEqUsd,
         COUNT(*) AS requestCount,
         COALESCE(SUM(CASE WHEN COALESCE(cost_usd, 0) > 0 THEN 0 ELSE 1 END), 0) AS estimateCount,
         COALESCE(MIN(date_sec), 0) AS firstActivitySec,
         COALESCE(MAX(date_sec), 0) AS lastActivitySec
       FROM claude_usage_events
       WHERE ${HAS_TOKEN_USAGE_SQL} AND TRIM(project_slug) != ''
       GROUP BY project_slug
       ORDER BY apiEqUsd DESC, project_slug ASC`,
    )
    .all() as ClaudeProjectBreakdownRow[];
}

export function queryClaudeProjectMonthlyApiEq(): {
  projectSlug: string;
  month: string;
  apiEqUsd: number;
}[] {
  return getDatabase()
    .prepare(
      `SELECT
         project_slug AS projectSlug,
         strftime('%Y-%m', datetime(date_sec, 'unixepoch')) AS month,
         COALESCE(SUM(${API_EQ_USD_SQL}), 0) AS apiEqUsd
       FROM claude_usage_events
       WHERE ${HAS_TOKEN_USAGE_SQL} AND TRIM(project_slug) != ''
       GROUP BY project_slug, month`,
    )
    .all() as { projectSlug: string; month: string; apiEqUsd: number }[];
}

export function queryClaudeHarnessMonthlyApiEqTotals(): {
  month: string;
  apiEqUsd: number;
}[] {
  return getDatabase()
    .prepare(
      `SELECT
         strftime('%Y-%m', datetime(date_sec, 'unixepoch')) AS month,
         COALESCE(SUM(${API_EQ_USD_SQL}), 0) AS apiEqUsd
       FROM claude_usage_events
       WHERE ${HAS_TOKEN_USAGE_SQL}
       GROUP BY month`,
    )
    .all() as { month: string; apiEqUsd: number }[];
}
