import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { getDataDir } from "@/lib/claude/path";
import { providerUsageRowToDisplay } from "@/lib/cursor/provider-usage-csv";
import type {
  ProviderUsageEventsPayload,
  ProviderUsageParsedRow,
  ProviderUsageUploadResult,
} from "@/lib/cursor/provider-usage-types";
import { PROVIDER_USAGE_CSV_COLUMNS } from "@/lib/cursor/provider-usage-types";
import {
  formatCursorRowCost,
  numericApiEqUsdFromProviderRow,
  numericBilledUsdFromProviderRow,
} from "@/lib/pricing/cursor-usage-cost";
import type { UsageCostMode } from "@/lib/pricing/usage-cost-types";

const DB_PATH = path.join(getDataDir(), "cursor-provider-usage.db");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let conn: Database.Database | null = null;

function getDatabase(): Database.Database {
  if (conn) return conn;
  fs.mkdirSync(getDataDir(), { recursive: true });
  conn = new Database(DB_PATH);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS provider_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_iso TEXT NOT NULL,
      date_sec REAL NOT NULL,
      cloud_agent_id TEXT NOT NULL DEFAULT '',
      automation_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      max_mode TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL DEFAULT '',
      project_unmatch_reason TEXT NOT NULL DEFAULT '',
      composer_id TEXT NOT NULL DEFAULT '',
      input_with_cache_write INTEGER,
      input_without_cache_write INTEGER,
      cache_read INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost TEXT NOT NULL DEFAULT '',
      row_hash TEXT NOT NULL UNIQUE,
      source_filename TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_provider_usage_date_sec
      ON provider_usage_events (date_sec);

    CREATE TABLE IF NOT EXISTS provider_usage_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      rows_inserted INTEGER NOT NULL DEFAULT 0,
      rows_skipped INTEGER NOT NULL DEFAULT 0,
      date_from TEXT,
      date_to TEXT
    );
  `);

  const cols = conn
    .prepare(`PRAGMA table_info(provider_usage_events)`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "project")) {
    conn.exec(
      `ALTER TABLE provider_usage_events ADD COLUMN project TEXT NOT NULL DEFAULT ''`,
    );
  }
  const colsAfter = conn
    .prepare(`PRAGMA table_info(provider_usage_events)`)
    .all() as { name: string }[];
  if (!colsAfter.some((c) => c.name === "project_unmatch_reason")) {
    conn.exec(
      `ALTER TABLE provider_usage_events ADD COLUMN project_unmatch_reason TEXT NOT NULL DEFAULT ''`,
    );
  }
  const colsComposer = conn
    .prepare(`PRAGMA table_info(provider_usage_events)`)
    .all() as { name: string }[];
  if (!colsComposer.some((c) => c.name === "composer_id")) {
    conn.exec(
      `ALTER TABLE provider_usage_events ADD COLUMN composer_id TEXT NOT NULL DEFAULT ''`,
    );
  }

  const importCols = conn
    .prepare(`PRAGMA table_info(provider_usage_imports)`)
    .all() as { name: string }[];
  if (!importCols.some((c) => c.name === "date_from")) {
    conn.exec(`ALTER TABLE provider_usage_imports ADD COLUMN date_from TEXT`);
  }
  if (!importCols.some((c) => c.name === "date_to")) {
    conn.exec(`ALTER TABLE provider_usage_imports ADD COLUMN date_to TEXT`);
  }
  conn.exec(`
    UPDATE provider_usage_imports
    SET date_from = (
      SELECT MIN(substr(date_iso, 1, 10))
      FROM provider_usage_events e
      WHERE e.source_filename = provider_usage_imports.filename
        AND e.imported_at = provider_usage_imports.imported_at
    ),
    date_to = (
      SELECT MAX(substr(date_iso, 1, 10))
      FROM provider_usage_events e
      WHERE e.source_filename = provider_usage_imports.filename
        AND e.imported_at = provider_usage_imports.imported_at
    )
    WHERE date_from IS NULL OR date_to IS NULL
  `);

  return conn;
}

interface DbEventRow {
  date_iso: string;
  date_sec: number;
  cloud_agent_id: string;
  automation_id: string;
  kind: string;
  model: string;
  max_mode: string;
  project: string;
  project_unmatch_reason: string;
  composer_id: string;
  input_with_cache_write: number | null;
  input_without_cache_write: number | null;
  cache_read: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost: string;
}

function toDbRow(
  row: ProviderUsageParsedRow,
  sourceFilename: string,
  importedAt: string,
): DbEventRow & { row_hash: string; source_filename: string; imported_at: string } {
  const dateSec = Date.parse(row.date) / 1000;
  return {
    date_iso: row.date,
    date_sec: dateSec,
    cloud_agent_id: row.cloudAgentId,
    automation_id: row.automationId,
    kind: row.kind,
    model: row.model,
    max_mode: row.maxMode,
    project: row.project,
    project_unmatch_reason: "",
    composer_id: "",
    input_with_cache_write: row.inputWithCacheWrite,
    input_without_cache_write: row.inputWithoutCacheWrite,
    cache_read: row.cacheRead,
    output_tokens: row.outputTokens,
    total_tokens: row.totalTokens,
    cost: row.cost,
    row_hash: row.rowHash,
    source_filename: sourceFilename,
    imported_at: importedAt,
  };
}

export function importProviderUsageRows(
  rows: ProviderUsageParsedRow[],
  filename: string,
): ProviderUsageUploadResult {
  const db = getDatabase();
  const importedAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO provider_usage_events (
      date_iso, date_sec, cloud_agent_id, automation_id, kind, model, max_mode, project,
      project_unmatch_reason,
      input_with_cache_write, input_without_cache_write, cache_read,
      output_tokens, total_tokens, cost, row_hash, source_filename, imported_at
    ) VALUES (
      @date_iso, @date_sec, @cloud_agent_id, @automation_id, @kind, @model, @max_mode, @project,
      @project_unmatch_reason,
      @input_with_cache_write, @input_without_cache_write, @cache_read,
      @output_tokens, @total_tokens, @cost, @row_hash, @source_filename, @imported_at
    )
  `);

  let inserted = 0;
  const tx = db.transaction((batch: ProviderUsageParsedRow[]) => {
    for (const row of batch) {
      const result = insert.run(toDbRow(row, filename, importedAt));
      if (result.changes > 0) inserted += 1;
    }
  });
  tx(rows);

  const skipped = rows.length - inserted;
  const csvDays = rows
    .map((row) => row.date.slice(0, 10))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();
  const dateFrom = csvDays[0] ?? null;
  const dateTo = csvDays.length > 0 ? csvDays[csvDays.length - 1]! : null;

  db.prepare(
    `INSERT INTO provider_usage_imports (
      filename, imported_at, rows_inserted, rows_skipped, date_from, date_to
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(filename, importedAt, inserted, skipped, dateFrom, dateTo);

  return {
    inserted,
    skipped,
    totalParsed: rows.length,
    filename,
    dateFrom,
    dateTo,
  };
}

function rowToParsed(r: DbEventRow): ProviderUsageParsedRow {
  return {
    date: r.date_iso,
    cloudAgentId: r.cloud_agent_id,
    automationId: r.automation_id,
    kind: r.kind,
    model: r.model,
    maxMode: r.max_mode,
    project: r.project ?? "",
    composerId: r.composer_id ?? "",
    inputWithCacheWrite: r.input_with_cache_write,
    inputWithoutCacheWrite: r.input_without_cache_write,
    cacheRead: r.cache_read,
    outputTokens: r.output_tokens,
    totalTokens: r.total_tokens,
    cost: r.cost,
    rowHash: "",
  };
}

export function providerUsageDbHasRows(): boolean {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM provider_usage_events`)
    .get() as { c: number };
  return row.c > 0;
}

export function queryProviderUsageEventsInRange(
  startSec: number,
  endSec: number,
): ProviderUsageParsedRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT date_iso, cloud_agent_id, automation_id, kind, model, max_mode, project, composer_id,
              input_with_cache_write, input_without_cache_write, cache_read,
              output_tokens, total_tokens, cost
       FROM provider_usage_events
       WHERE date_sec >= ? AND date_sec <= ?
       ORDER BY date_sec ASC`,
    )
    .all(startSec, endSec) as DbEventRow[];
  return rows.map((r) => rowToParsed(r));
}

export function queryAllProviderUsageEvents(): ProviderUsageParsedRow[] {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT MAX(date_sec) AS maxSec FROM provider_usage_events`)
    .get() as { maxSec: number | null };
  const endSec = row.maxSec ?? Math.floor(Date.now() / 1000);
  return queryProviderUsageEventsInRange(0, endSec);
}

export function queryProviderUsageEventCount(): number {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM provider_usage_events`)
    .get() as { c: number };
  return row.c;
}

export function getLastProviderImportAt(): string | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT MAX(imported_at) AS lastAt FROM provider_usage_imports`)
    .get() as { lastAt: string | null };
  return row.lastAt;
}

export function queryProviderUsageAvailableYears(): number[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(strftime('%Y', date_iso) AS INTEGER) AS y
       FROM provider_usage_events ORDER BY y DESC`,
    )
    .all() as { y: number }[];
  return rows.map((r) => r.y);
}

interface DbEventRowWithId extends DbEventRow {
  id: number;
}

export type ProviderProjectBreakdownRow = {
  projectPath: string;
  apiEqUsd: number;
  requestCount: number;
  estimateCount: number;
  firstActivitySec: number;
  lastActivitySec: number;
};

export function queryProviderProjectBreakdown(): ProviderProjectBreakdownRow[] {
  const events = queryAllProviderUsageEvents();
  const byProject = new Map<
    string,
    {
      apiEqUsd: number;
      requestCount: number;
      estimateCount: number;
      firstActivitySec: number;
      lastActivitySec: number;
    }
  >();

  for (const evt of events) {
    const projectPath = evt.project?.trim() ?? "";
    if (!projectPath) continue;

    const apiEq = numericApiEqUsdFromProviderRow(evt);
    const billed = numericBilledUsdFromProviderRow(evt);
    const dateSec = Math.floor(Date.parse(evt.date) / 1000);
    const bucket = byProject.get(projectPath) ?? {
      apiEqUsd: 0,
      requestCount: 0,
      estimateCount: 0,
      firstActivitySec: 0,
      lastActivitySec: 0,
    };

    bucket.apiEqUsd += apiEq;
    bucket.requestCount += 1;
    if (billed <= 0 && apiEq > 0) bucket.estimateCount += 1;
    if (Number.isFinite(dateSec) && dateSec > 0) {
      bucket.firstActivitySec =
        bucket.firstActivitySec === 0
          ? dateSec
          : Math.min(bucket.firstActivitySec, dateSec);
      bucket.lastActivitySec = Math.max(bucket.lastActivitySec, dateSec);
    }

    byProject.set(projectPath, bucket);
  }

  return [...byProject.entries()]
    .map(([projectPath, data]) => ({ projectPath, ...data }))
    .sort((a, b) => b.apiEqUsd - a.apiEqUsd || a.projectPath.localeCompare(b.projectPath));
}

export function queryProviderMonthlyApiEqBreakdown(): {
  harnessTotalsByMonth: Map<string, number>;
  projectMonthlyByPath: Map<string, Map<string, number>>;
} {
  const harnessTotalsByMonth = new Map<string, number>();
  const projectMonthlyByPath = new Map<string, Map<string, number>>();

  for (const evt of queryAllProviderUsageEvents()) {
    const apiEq = numericApiEqUsdFromProviderRow(evt);
    if (apiEq <= 0) continue;

    const month = evt.date.slice(0, 7);
    harnessTotalsByMonth.set(
      month,
      (harnessTotalsByMonth.get(month) ?? 0) + apiEq,
    );

    const projectPath = evt.project?.trim() ?? "";
    if (!projectPath) continue;

    let byMonth = projectMonthlyByPath.get(projectPath);
    if (!byMonth) {
      byMonth = new Map<string, number>();
      projectMonthlyByPath.set(projectPath, byMonth);
    }
    byMonth.set(month, (byMonth.get(month) ?? 0) + apiEq);
  }

  return { harnessTotalsByMonth, projectMonthlyByPath };
}

export function queryDistinctProviderProjectPaths(): { path: string }[] {
  return getDatabase()
    .prepare(
      `SELECT DISTINCT project AS path FROM provider_usage_events
       WHERE TRIM(project) != ''
       ORDER BY path ASC`,
    )
    .all() as { path: string }[];
}

export function queryDistinctProviderModels(): { model: string }[] {
  return getDatabase()
    .prepare(
      `SELECT DISTINCT model FROM provider_usage_events
       WHERE TRIM(model) != ''
       ORDER BY model ASC`,
    )
    .all() as { model: string }[];
}

export function queryProviderUsageEventsForRawSpend(input: {
  fromSec: number;
  toSec: number;
  project?: string;
  model?: string;
  sort: "last_request" | "highest_spend";
  offset: number;
  limit: number;
}): { rows: (ProviderUsageParsedRow & { id: number })[]; total: number } {
  const db = getDatabase();
  const filterClauses: string[] = [];
  const filterParams: string[] = [];
  if (input.project) {
    filterClauses.push("project = ?");
    filterParams.push(input.project);
  }
  if (input.model) {
    filterClauses.push("model = ?");
    filterParams.push(input.model);
  }
  const filterSql = filterClauses.length
    ? ` AND ${filterClauses.join(" AND ")}`
    : "";

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM provider_usage_events
       WHERE date_sec >= ? AND date_sec <= ?${filterSql}`,
    )
    .get(input.fromSec, input.toSec, ...filterParams) as { c: number };

  const orderSql =
    input.sort === "highest_spend"
      ? `total_tokens DESC, date_sec DESC`
      : `date_sec DESC`;

  const rows = db
    .prepare(
      `SELECT id, date_iso, cloud_agent_id, automation_id, kind, model, max_mode, project, composer_id,
              input_with_cache_write, input_without_cache_write, cache_read,
              output_tokens, total_tokens, cost
       FROM provider_usage_events
       WHERE date_sec >= ? AND date_sec <= ?${filterSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
    )
    .all(
      input.fromSec,
      input.toSec,
      ...filterParams,
      input.limit,
      input.offset,
    ) as DbEventRowWithId[];

  return {
    rows: rows.map((r) => ({ id: r.id, ...rowToParsed(r) })),
    total: totalRow.c,
  };
}

export function queryProviderUsageDays(): string[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT DISTINCT date(date_iso) AS day FROM provider_usage_events ORDER BY day ASC`,
    )
    .all() as { day: string }[];
  return rows.map((r) => r.day);
}

export function queryProviderUsageBounds(): {
  minDateSec: number | null;
  maxDateSec: number | null;
} {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT MIN(date_sec) AS minSec, MAX(date_sec) AS maxSec FROM provider_usage_events`,
    )
    .get() as { minSec: number | null; maxSec: number | null };
  return { minDateSec: row.minSec, maxDateSec: row.maxSec };
}

export function queryProviderUsageImports(): {
  filename: string;
  importedAt: string;
  rowsInserted: number;
  rowsSkipped: number;
  dateFrom: string | null;
  dateTo: string | null;
}[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT filename, imported_at, rows_inserted, rows_skipped, date_from, date_to
       FROM provider_usage_imports ORDER BY imported_at DESC LIMIT 50`,
    )
    .all() as {
    filename: string;
    imported_at: string;
    rows_inserted: number;
    rows_skipped: number;
    date_from: string | null;
    date_to: string | null;
  }[];

  return rows.map((r) => ({
    filename: r.filename,
    importedAt: r.imported_at,
    rowsInserted: r.rows_inserted,
    rowsSkipped: r.rows_skipped,
    dateFrom: r.date_from,
    dateTo: r.date_to,
  }));
}

export function queryMonthlyProviderSpend(month: string): {
  totalApiEqvUsd: number;
  extraBilledUsd: number;
  dailySparkline: { date: string; apiEqvUsd: number }[];
} {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  const fromSec = Math.floor(start.getTime() / 1000);
  const toSec = Math.floor(end.getTime() / 1000);

  const events = queryProviderUsageEventsInRange(fromSec, toSec);
  const byDay = new Map<string, number>();
  let totalApiEqvUsd = 0;
  let extraBilledUsd = 0;

  for (const evt of events) {
    totalApiEqvUsd += numericApiEqUsdFromProviderRow(evt);
    extraBilledUsd += numericBilledUsdFromProviderRow(evt);
    const day = evt.date.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + numericApiEqUsdFromProviderRow(evt));
  }

  const dailySparkline = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, apiEqvUsd]) => ({ date, apiEqvUsd }));

  return { totalApiEqvUsd, extraBilledUsd, dailySparkline };
}

export function queryYearProviderSpendByMonth(year: number): {
  month: string;
  totalApiEqvUsd: number;
  extraBilledUsd: number;
  dailySparkline: { date: string; apiEqvUsd: number }[];
}[] {
  const fromSec = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const toSec = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
  const events = queryProviderUsageEventsInRange(fromSec, toSec);

  const byMonth = new Map<
    string,
    {
      totalApiEqvUsd: number;
      extraBilledUsd: number;
      dailySparkline: Map<string, number>;
    }
  >();

  for (const evt of events) {
    const apiEq = numericApiEqUsdFromProviderRow(evt);
    const billed = numericBilledUsdFromProviderRow(evt);
    const day = evt.date.slice(0, 10);
    const month = day.slice(0, 7);
    let bucket = byMonth.get(month);
    if (!bucket) {
      bucket = {
        totalApiEqvUsd: 0,
        extraBilledUsd: 0,
        dailySparkline: new Map(),
      };
      byMonth.set(month, bucket);
    }
    bucket.totalApiEqvUsd += apiEq;
    bucket.extraBilledUsd += billed;
    bucket.dailySparkline.set(day, (bucket.dailySparkline.get(day) ?? 0) + apiEq);
  }

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (year === now.getUTCFullYear() && !byMonth.has(currentMonth)) {
    byMonth.set(currentMonth, {
      totalApiEqvUsd: 0,
      extraBilledUsd: 0,
      dailySparkline: new Map(),
    });
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, data]) => ({
      month,
      totalApiEqvUsd: data.totalApiEqvUsd,
      extraBilledUsd: data.extraBilledUsd,
      dailySparkline: [...data.dailySparkline.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, apiEqvUsd]) => ({ date, apiEqvUsd })),
    }));
}

function numericUsdFromProviderRow(row: ProviderUsageParsedRow): number {
  return numericApiEqUsdFromProviderRow(row);
}

export function queryProviderUsageEvents(input: {
  fromSec: number;
  toSec: number;
  page: number;
  pageSize: number;
  costMode?: UsageCostMode;
}): ProviderUsageEventsPayload {
  const costMode = input.costMode ?? "both";
  const db = getDatabase();

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM provider_usage_events
       WHERE date_sec >= ? AND date_sec <= ?`,
    )
    .get(input.fromSec, input.toSec) as { c: number };

  const boundsRow = db
    .prepare(
      `SELECT MIN(date_sec) AS minSec, MAX(date_sec) AS maxSec
       FROM provider_usage_events`,
    )
    .get() as { minSec: number | null; maxSec: number | null };

  const offset = (input.page - 1) * input.pageSize;
  const rows = db
    .prepare(
      `SELECT date_iso, cloud_agent_id, automation_id, kind, model, max_mode, project, composer_id,
              input_with_cache_write, input_without_cache_write, cache_read,
              output_tokens, total_tokens, cost
       FROM provider_usage_events
       WHERE date_sec >= ? AND date_sec <= ?
       ORDER BY date_sec DESC
       LIMIT ? OFFSET ?`,
    )
    .all(input.fromSec, input.toSec, input.pageSize, offset) as DbEventRow[];

  const parsedRows = rows.map((r) => rowToParsed(r));
  const costDisplays = parsedRows.map((r) => formatCursorRowCost(r, costMode));

  const fromIso = new Date(input.fromSec * 1000).toISOString().slice(0, 10);
  const toIso = new Date(input.toSec * 1000).toISOString().slice(0, 10);

  return {
    from: fromIso,
    to: toIso,
    page: input.page,
    pageSize: input.pageSize,
    total: totalRow.c,
    costMode,
    columns: [...PROVIDER_USAGE_CSV_COLUMNS],
    rows: parsedRows.map((r) =>
      providerUsageRowToDisplay({
        dateIso: r.date,
        cloudAgentId: r.cloudAgentId,
        automationId: r.automationId,
        kind: r.kind,
        model: r.model,
        maxMode: r.maxMode,
        project: r.project,
        inputWithCacheWrite: r.inputWithCacheWrite,
        inputWithoutCacheWrite: r.inputWithoutCacheWrite,
        cacheRead: r.cacheRead,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        cost: r.cost,
      }),
    ),
    costDisplays,
    bounds: {
      minDateSec: boundsRow.minSec,
      maxDateSec: boundsRow.maxSec,
    },
  };
}

export type DbEventForAttach = {
  id: number;
  dateIso: string;
  dateSec: number;
  kind: string;
  model: string;
  cost: string;
  project: string;
  projectUnmatchReason: string;
  composerId: string;
};

export function queryProviderEventsForProjectAttach(options?: {
  fromSec?: number;
  toSec?: number;
  /** UTC calendar month `YYYY-MM` */
  month?: string;
  /** Skip rows that already have both project and composer_id. */
  unattachedOnly?: boolean;
  /** Skip rows that already failed matching (have project_unmatch_reason). */
  pendingOnly?: boolean;
}): DbEventForAttach[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (options?.fromSec != null) {
    conditions.push("date_sec >= ?");
    params.push(options.fromSec);
  }
  if (options?.toSec != null) {
    conditions.push("date_sec <= ?");
    params.push(options.toSec);
  }
  if (options?.month) {
    conditions.push("strftime('%Y-%m', date_iso) = ?");
    params.push(options.month);
  }
  if (options?.unattachedOnly !== false) {
    conditions.push("(TRIM(composer_id) = '' OR TRIM(project) = '')");
  }
  if (options?.pendingOnly) {
    conditions.push(`(
      (TRIM(project) = '' AND TRIM(project_unmatch_reason) = '')
      OR (
        TRIM(project) != ''
        AND TRIM(composer_id) = ''
        AND TRIM(project_unmatch_reason) = ''
      )
    )`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT id, date_iso, date_sec, kind, model, cost, project, project_unmatch_reason, composer_id
       FROM provider_usage_events
       ${where}
       ORDER BY date_sec ASC`,
    )
    .all(...params) as {
    id: number;
    date_iso: string;
    date_sec: number;
    kind: string;
    model: string;
    cost: string;
    project: string;
    project_unmatch_reason: string;
    composer_id: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    dateIso: r.date_iso,
    dateSec: r.date_sec,
    kind: r.kind,
    model: r.model,
    cost: r.cost,
    project: r.project ?? "",
    projectUnmatchReason: r.project_unmatch_reason ?? "",
    composerId: r.composer_id ?? "",
  }));
}

export function updateProviderEventComposerId(
  id: number,
  composerId: string,
): void {
  getDatabase()
    .prepare(`UPDATE provider_usage_events SET composer_id = ? WHERE id = ?`)
    .run(composerId, id);
}

export function clearProviderEventUnmatchReason(id: number): void {
  getDatabase()
    .prepare(
      `UPDATE provider_usage_events SET project_unmatch_reason = '' WHERE id = ?`,
    )
    .run(id);
}

/** Record a failed match attempt without clearing an existing CSV project path. */
export function updateProviderEventAttributionFailure(
  id: number,
  reason: string,
): void {
  getDatabase()
    .prepare(
      `UPDATE provider_usage_events
       SET project_unmatch_reason = ?
       WHERE id = ?`,
    )
    .run(reason, id);
}

export function updateProviderEventProjectAttach(
  id: number,
  project: string,
  unmatchReason: string | null,
  composerId?: string | null,
): void {
  if (composerId !== undefined) {
    getDatabase()
      .prepare(
        `UPDATE provider_usage_events
         SET project = ?, project_unmatch_reason = ?, composer_id = ?
         WHERE id = ?`,
      )
      .run(project, unmatchReason ?? "", composerId ?? "", id);
    return;
  }

  getDatabase()
    .prepare(
      `UPDATE provider_usage_events
       SET project = ?, project_unmatch_reason = ?
       WHERE id = ?`,
    )
    .run(project, unmatchReason ?? "", id);
}

export type ProjectAttachBatchUpdate =
  | { type: "clear_reason"; id: number }
  | { type: "composer"; id: number; composerId: string }
  | { type: "failure"; id: number; reason: string }
  | {
      type: "project";
      id: number;
      project: string;
      unmatchReason: string | null;
      composerId: string;
    };

export function applyProjectAttachBatch(updates: ProjectAttachBatchUpdate[]): void {
  if (updates.length === 0) return;

  const db = getDatabase();
  const clearReason = db.prepare(
    `UPDATE provider_usage_events SET project_unmatch_reason = '' WHERE id = ?`,
  );
  const setComposer = db.prepare(
    `UPDATE provider_usage_events SET composer_id = ? WHERE id = ?`,
  );
  const setFailure = db.prepare(
    `UPDATE provider_usage_events SET project_unmatch_reason = ? WHERE id = ?`,
  );
  const setProject = db.prepare(
    `UPDATE provider_usage_events
     SET project = ?, project_unmatch_reason = ?, composer_id = ?
     WHERE id = ?`,
  );

  db.transaction(() => {
    for (const update of updates) {
      switch (update.type) {
        case "clear_reason":
          clearReason.run(update.id);
          break;
        case "composer":
          setComposer.run(update.composerId, update.id);
          break;
        case "failure":
          setFailure.run(update.reason, update.id);
          break;
        case "project":
          setProject.run(
            update.project,
            update.unmatchReason ?? "",
            update.composerId,
            update.id,
          );
          break;
      }
    }
  })();
}

export function queryProjectAttributionStats(): {
  total: number;
  matched: number;
  unmatched: number;
} {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN TRIM(project) != '' THEN 1 ELSE 0 END), 0) AS matched,
         COALESCE(SUM(CASE WHEN TRIM(project) = '' THEN 1 ELSE 0 END), 0) AS unmatched
       FROM provider_usage_events`,
    )
    .get() as { total: number; matched: number; unmatched: number };
  return row;
}

export function queryUnmatchedBillingEvents(limit = 100): DbEventForAttach[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, date_iso, date_sec, kind, model, cost, project, project_unmatch_reason, composer_id
       FROM provider_usage_events
       WHERE TRIM(project) = ''
       ORDER BY date_sec DESC
       LIMIT ?`,
    )
    .all(limit) as {
    id: number;
    date_iso: string;
    date_sec: number;
    kind: string;
    model: string;
    cost: string;
    project: string;
    project_unmatch_reason: string;
    composer_id: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    dateIso: r.date_iso,
    dateSec: r.date_sec,
    kind: r.kind,
    model: r.model,
    cost: r.cost,
    project: r.project ?? "",
    projectUnmatchReason: r.project_unmatch_reason ?? "",
    composerId: r.composer_id ?? "",
  }));
}

export type ProjectSyncMonthRow = {
  month: string;
  totalRows: number;
  /** Rows not yet matched (no prior sync attempt recorded) */
  pendingRows: number;
  matchedRows: number;
  unmatchedRows: number;
};

export function queryProjectSyncMonths(): ProjectSyncMonthRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-%m', date_iso) AS month,
         COUNT(*) AS total_rows,
         SUM(
           CASE
             WHEN
               (TRIM(project) = '' AND TRIM(project_unmatch_reason) = '')
               OR (
                 TRIM(project) != ''
                 AND TRIM(composer_id) = ''
                 AND TRIM(project_unmatch_reason) = ''
               )
             THEN 1
             ELSE 0
           END
         ) AS pending_rows,
         SUM(
           CASE
             WHEN TRIM(project) != '' AND TRIM(composer_id) != '' THEN 1
             ELSE 0
           END
         ) AS matched_rows,
         SUM(
           CASE
             WHEN TRIM(project_unmatch_reason) != '' THEN 1
             ELSE 0
           END
         ) AS unmatched_rows
       FROM provider_usage_events
       GROUP BY month
       ORDER BY month ASC`,
    )
    .all() as {
    month: string;
    total_rows: number;
    pending_rows: number;
    matched_rows: number;
    unmatched_rows: number;
  }[];

  return rows.map((row) => ({
    month: row.month,
    totalRows: row.total_rows,
    pendingRows: row.pending_rows,
    matchedRows: row.matched_rows,
    unmatchedRows: row.unmatched_rows,
  }));
}
