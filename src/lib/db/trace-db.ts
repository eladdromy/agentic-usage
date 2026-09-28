/**
 * Claude trace index (full interaction/request/tool timeline).
 *
 * Fully isolated from the usage indexer: its own better-sqlite3 database file
 * (`.data/claude-trace.db`) and singleton connection, so existing usage/billing
 * sync is never touched. Incremental: a global mtime watermark gates work and a
 * per-session source hash means only changed session files are re-parsed, with
 * that session's rows replaced in a single transaction.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { discoverClaudeJsonlFiles } from "@/lib/claude/discovery";
import { getDataDir } from "@/lib/claude/path";
import {
  decodeProjectSlugForDisplay,
  projectNameFromSlug,
} from "@/lib/claude/project-slugs";
import { readSettings } from "@/lib/profile/settings";
import {
  groupInteractions,
  parseSessionJsonlFile,
} from "@/lib/claude/trace/session-parse";
import type {
  ParsedSessionFile,
  TraceContentPart,
  TraceInteraction,
  TraceRequestRow,
} from "@/lib/claude/trace/types";
import type {
  TraceSubagentBranchMeta,
  TraceTimelinePart,
} from "@/lib/tracing-shared";

let conn: Database.Database | null = null;

function dbPath(): string {
  return path.join(getDataDir(), "claude-trace.db");
}

export function getTraceDatabase(): Database.Database {
  if (conn) return conn;
  fs.mkdirSync(getDataDir(), { recursive: true });
  conn = new Database(dbPath());
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS claude_trace_sessions (
      session_id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL DEFAULT '',
      project_path TEXT NOT NULL DEFAULT '',
      session_name TEXT,
      started_sec REAL,
      last_request_sec REAL,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      user_request_count INTEGER NOT NULL DEFAULT 0,
      model_label TEXT,
      cost_usd REAL,
      file_key TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_trace_sessions_project
      ON claude_trace_sessions (project_slug);
    CREATE INDEX IF NOT EXISTS idx_trace_sessions_last
      ON claude_trace_sessions (last_request_sec);

    CREATE TABLE IF NOT EXISTS claude_trace_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      started_sec REAL,
      ended_sec REAL,
      request_count INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      tool_summary_json TEXT,
      cost_usd REAL
    );
    CREATE INDEX IF NOT EXISTS idx_trace_interactions_session
      ON claude_trace_interactions (session_id, idx);

    CREATE TABLE IF NOT EXISTS claude_trace_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      interaction_idx INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      record_uuid TEXT,
      prompt_id TEXT,
      role TEXT NOT NULL,
      agent_kind TEXT,
      tool_name TEXT,
      tool_use_id TEXT,
      parent_tool_use_id TEXT,
      is_subagent INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      created_sec REAL,
      context_pct REAL,
      content_json TEXT NOT NULL DEFAULT '[]',
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      cost_usd REAL,
      preview TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trace_requests_session_interaction
      ON claude_trace_requests (session_id, interaction_idx, seq);

    CREATE TABLE IF NOT EXISTS claude_trace_tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      tool_use_id TEXT,
      name TEXT NOT NULL,
      params_json TEXT,
      result_json TEXT,
      status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trace_tool_calls_request
      ON claude_trace_tool_calls (request_id);

    CREATE TABLE IF NOT EXISTS claude_trace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const cols = conn.prepare(`PRAGMA table_info(claude_trace_sessions)`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "project_path")) {
    conn.exec(
      `ALTER TABLE claude_trace_sessions ADD COLUMN project_path TEXT NOT NULL DEFAULT ''`,
    );
  }
  return conn;
}

// --- meta helpers ------------------------------------------------------------

function metaGet(key: string): string | null {
  const row = getTraceDatabase()
    .prepare(`SELECT value FROM claude_trace_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function metaSet(key: string, value: string): void {
  getTraceDatabase()
    .prepare(
      `INSERT INTO claude_trace_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

// --- discovery ---------------------------------------------------------------

const ROOT_SESSION_RE = /^projects\/([^/]+)\/([^/]+)\.jsonl$/;

type RootSessionFile = {
  fileKey: string;
  absolutePath: string;
  mtimeMs: number;
  projectSlug: string;
  sessionId: string;
  sourceHash: string;
};

function discoverRootSessionFiles(
  claudeHomeOverride?: string | null,
): RootSessionFile[] {
  const out: RootSessionFile[] = [];
  for (const file of discoverClaudeJsonlFiles(claudeHomeOverride)) {
    const match = file.fileKey.match(ROOT_SESSION_RE);
    if (!match) continue; // skip subagent files (loaded within their session)
    out.push({
      ...file,
      projectSlug: match[1]!,
      sessionId: match[2]!,
      sourceHash: String(file.mtimeMs),
    });
  }
  return out;
}

// --- content preview ---------------------------------------------------------

function firstText(parts: TraceContentPart[]): string | null {
  for (const part of parts) {
    if (part.kind === "text" && part.value.trim()) return part.value.trim();
  }
  return null;
}

function previewForRow(row: TraceRequestRow): string {
  const text = firstText(row.content);
  if (text) return text.replace(/\s+/g, " ").slice(0, 160);
  if (row.agentKind === "thinking") return "Thinking";
  if (row.toolName) return row.toolName;
  if (row.agentKind === "tool_result") return "Tool result";
  return row.role === "User" ? "User request" : "Agent";
}

// --- indexing one session ----------------------------------------------------

function insertToolCalls(
  db: Database.Database,
  requestId: number,
  row: TraceRequestRow,
): void {
  const insert = db.prepare(
    `INSERT INTO claude_trace_tool_calls
       (request_id, tool_use_id, name, params_json, result_json, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const part of row.content) {
    if (part.kind === "tool_use") {
      insert.run(
        requestId,
        part.toolUseId,
        part.name,
        JSON.stringify(part.input ?? null),
        null,
        "call",
      );
    } else if (part.kind === "tool_result") {
      insert.run(
        requestId,
        part.toolUseId,
        row.toolName ?? "tool_result",
        null,
        JSON.stringify(part.content ?? null),
        part.isError ? "error" : "ok",
      );
    }
  }
}

function insertRequestRow(
  db: Database.Database,
  sessionId: string,
  interactionIdx: number,
  seq: number,
  isSubagent: boolean,
  row: TraceRequestRow,
): number {
  const info = db
    .prepare(
      `INSERT INTO claude_trace_requests (
        session_id, interaction_idx, seq, record_uuid, prompt_id, role,
        agent_kind, tool_name, tool_use_id, parent_tool_use_id, is_subagent,
        model, created_sec, context_pct, content_json,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
        cost_usd, preview
      ) VALUES (
        @session_id, @interaction_idx, @seq, @record_uuid, @prompt_id, @role,
        @agent_kind, @tool_name, @tool_use_id, @parent_tool_use_id, @is_subagent,
        @model, @created_sec, @context_pct, @content_json,
        @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
        @cost_usd, @preview
      )`,
    )
    .run({
      session_id: sessionId,
      interaction_idx: interactionIdx,
      seq,
      record_uuid: row.recordUuid,
      prompt_id: row.promptId,
      role: row.role,
      agent_kind: row.agentKind,
      tool_name: row.toolName,
      tool_use_id: row.toolUseId,
      parent_tool_use_id: row.parentToolUseId,
      is_subagent: isSubagent ? 1 : 0,
      model: row.model,
      created_sec: row.createdSec,
      context_pct: row.contextPct,
      content_json: JSON.stringify(row.content),
      input_tokens: row.usage?.inputTokens ?? null,
      output_tokens: row.usage?.outputTokens ?? null,
      cache_read_tokens: row.usage?.cacheReadTokens ?? null,
      cache_write_tokens: row.usage?.cacheWriteTokens ?? null,
      cost_usd: row.apiCostUsd ?? null,
      preview: previewForRow(row),
    });
  const requestId = Number(info.lastInsertRowid);
  insertToolCalls(db, requestId, row);
  return requestId;
}

function deleteSessionRows(db: Database.Database, sessionId: string): void {
  db.prepare(`DELETE FROM claude_trace_tool_calls WHERE request_id IN
    (SELECT id FROM claude_trace_requests WHERE session_id = ?)`).run(sessionId);
  db.prepare(`DELETE FROM claude_trace_requests WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM claude_trace_interactions WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM claude_trace_sessions WHERE session_id = ?`).run(sessionId);
}

function indexSession(
  db: Database.Database,
  file: RootSessionFile,
  parsed: ParsedSessionFile,
): void {
  const interactions = groupInteractions(parsed.requests);
  let totalCost: number | null = null;
  let seq = 0;

  for (const interaction of interactions) {
    db.prepare(
      `INSERT INTO claude_trace_interactions
         (session_id, idx, started_sec, ended_sec, request_count, model, tool_summary_json, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      parsed.sessionId,
      interaction.idx,
      interaction.startedSec,
      interaction.endedSec,
      interaction.requestCount,
      interaction.model,
      JSON.stringify(interaction.toolSummary),
      interaction.costUsd,
    );
    if (interaction.costUsd != null) {
      totalCost = (totalCost ?? 0) + interaction.costUsd;
    }

    for (const row of interaction.requests) {
      insertRequestRow(db, parsed.sessionId, interaction.idx, seq++, false, row);
      if (row.subagentBranch) {
        for (const child of row.subagentBranch.requests) {
          insertRequestRow(db, parsed.sessionId, interaction.idx, seq++, true, {
            ...child,
            parentToolUseId: child.parentToolUseId ?? row.subagentBranch.toolUseId,
          });
        }
      }
    }
  }

  const projectPath = decodeProjectSlugForDisplay(file.projectSlug);
  db.prepare(
    `INSERT INTO claude_trace_sessions (
       session_id, project_slug, project_path, session_name, started_sec, last_request_sec,
       interaction_count, request_count, user_request_count, model_label,
       cost_usd, file_key, source_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    parsed.sessionId,
    file.projectSlug,
    projectPath,
    parsed.sessionName,
    parsed.startedAtSec,
    parsed.lastRequestAtSec,
    interactions.length,
    parsed.requests.length,
    parsed.userRequestCount,
    interactionsModelLabel(interactions),
    totalCost,
    file.fileKey,
    file.sourceHash,
  );
}

function interactionsModelLabel(interactions: TraceInteraction[]): string | null {
  for (const interaction of interactions) {
    if (interaction.model) return interaction.model;
  }
  return null;
}

function markClaudeSessionSkipped(
  db: Database.Database,
  file: RootSessionFile,
): void {
  const projectPath = decodeProjectSlugForDisplay(file.projectSlug);
  db.prepare(
    `INSERT INTO claude_trace_sessions (
       session_id, project_slug, project_path, file_key, source_hash,
       interaction_count, request_count, user_request_count
     ) VALUES (?, ?, ?, ?, ?, 0, 0, 0)
     ON CONFLICT(session_id) DO UPDATE SET
       source_hash = excluded.source_hash,
       file_key = excluded.file_key`,
  ).run(
    file.sessionId,
    file.projectSlug,
    projectPath,
    file.fileKey,
    file.sourceHash,
  );
}

function syncOneFile(db: Database.Database, file: RootSessionFile): boolean {
  const existing = db
    .prepare(`SELECT source_hash FROM claude_trace_sessions WHERE session_id = ?`)
    .get(file.sessionId) as { source_hash: string } | undefined;
  if (existing && existing.source_hash === file.sourceHash) return false;

  let parsed: ParsedSessionFile;
  try {
    parsed = parseSessionJsonlFile(file.absolutePath);
  } catch (error) {
    console.error(
      `[trace-db] Failed to parse session ${file.sessionId}:`,
      error,
    );
    markClaudeSessionSkipped(db, file);
    return false;
  }
  try {
    const run = db.transaction(() => {
      deleteSessionRows(db, file.sessionId);
      indexSession(db, file, parsed);
    });
    run();
  } catch (error) {
    console.error(
      `[trace-db] Failed to index session ${file.sessionId}:`,
      error,
    );
    markClaudeSessionSkipped(db, file);
    return false;
  }
  return true;
}

// --- public sync API ---------------------------------------------------------

export type TraceSyncResult = {
  filesScanned: number;
  sessionsIndexed: number;
  /** Changed sessions still needing a parse after this chunk (chunked sync). */
  remainingChanged?: number;
  /** Changed sessions attempted in this chunk (for progress UI). */
  changedProcessed?: number;
  skipped?: boolean;
};

const DEFAULT_TRACE_SYNC_CHUNK = 8;

function countChangedProjectFiles(
  db: Database.Database,
  files: RootSessionFile[],
): number {
  let n = 0;
  for (const file of files) {
    const existing = db
      .prepare(`SELECT source_hash FROM claude_trace_sessions WHERE session_id = ?`)
      .get(file.sessionId) as { source_hash: string } | undefined;
    if (!existing || existing.source_hash !== file.sourceHash) n += 1;
  }
  return n;
}

function watermarkMs(): number {
  const raw = metaGet("source_mtime_watermark");
  return raw ? Number.parseFloat(raw) : 0;
}

let ensurePromise: Promise<TraceSyncResult> | null = null;

/** Full incremental sync used by read routes as a safety net. */
export function ensureTraceSynced(
  claudeHomeOverride?: string | null,
): Promise<TraceSyncResult> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const override = claudeHomeOverride ?? readSettings().claudeHomeOverride;
    const files = discoverRootSessionFiles(override);
    const maxMtime = files.reduce((m, f) => Math.max(m, f.mtimeMs), 0);
    if (maxMtime <= watermarkMs()) {
      return { filesScanned: 0, sessionsIndexed: 0, skipped: true };
    }
    const db = getTraceDatabase();
    let sessionsIndexed = 0;
    for (const file of files) {
      if (syncOneFile(db, file)) sessionsIndexed += 1;
    }
    if (maxMtime > 0) metaSet("source_mtime_watermark", String(maxMtime));
    return { filesScanned: files.length, sessionsIndexed };
  })().finally(() => {
    ensurePromise = null;
  });
  return ensurePromise;
}

export type TraceSyncPlanProject = {
  projectSlug: string;
  projectName: string;
  changedFiles: number;
  totalFiles: number;
};

export type TraceSyncPlan = {
  projects: TraceSyncPlanProject[];
  totalChangedFiles: number;
};

/** Fast filesystem/hash check (no parse) for the progress UI. */
export function planTraceSync(claudeHomeOverride?: string | null): TraceSyncPlan {
  const override = claudeHomeOverride ?? readSettings().claudeHomeOverride;
  const files = discoverRootSessionFiles(override);
  const db = getTraceDatabase();
  const hashRows = db
    .prepare(`SELECT session_id, source_hash FROM claude_trace_sessions`)
    .all() as { session_id: string; source_hash: string }[];
  const known = new Map(hashRows.map((r) => [r.session_id, r.source_hash]));

  const byProject = new Map<string, { changed: number; total: number }>();
  for (const file of files) {
    const bucket = byProject.get(file.projectSlug) ?? { changed: 0, total: 0 };
    bucket.total += 1;
    if (known.get(file.sessionId) !== file.sourceHash) bucket.changed += 1;
    byProject.set(file.projectSlug, bucket);
  }

  const projects: TraceSyncPlanProject[] = [...byProject.entries()]
    .map(([projectSlug, counts]) => ({
      projectSlug,
      projectName: projectNameFromSlug(projectSlug),
      changedFiles: counts.changed,
      totalFiles: counts.total,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  return {
    projects,
    totalChangedFiles: projects.reduce((s, p) => s + p.changedFiles, 0),
  };
}

export type SyncTraceProjectOptions = {
  claudeHomeOverride?: string | null;
  /** Max changed sessions to parse per call; omit to index the whole project. */
  limit?: number;
};

/** Index changed sessions for one project (optionally in small chunks for the UI). */
export function syncTraceProject(
  projectSlug: string,
  options?: SyncTraceProjectOptions | string | null,
): TraceSyncResult {
  const opts: SyncTraceProjectOptions =
    typeof options === "string" || options === null || options === undefined
      ? { claudeHomeOverride: options ?? undefined }
      : options;
  const override = opts.claudeHomeOverride ?? readSettings().claudeHomeOverride;
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const files = discoverRootSessionFiles(override).filter(
    (f) => f.projectSlug === projectSlug,
  );
  const db = getTraceDatabase();
  let sessionsIndexed = 0;
  let changedProcessed = 0;

  for (const file of files) {
    const existing = db
      .prepare(`SELECT source_hash FROM claude_trace_sessions WHERE session_id = ?`)
      .get(file.sessionId) as { source_hash: string } | undefined;
    if (existing && existing.source_hash === file.sourceHash) continue;
    if (changedProcessed >= limit) break;
    if (syncOneFile(db, file)) sessionsIndexed += 1;
    changedProcessed += 1;
  }

  const remainingChanged = countChangedProjectFiles(db, files);
  return {
    filesScanned: files.length,
    sessionsIndexed,
    remainingChanged,
    changedProcessed,
  };
}

export { DEFAULT_TRACE_SYNC_CHUNK };

/** Called by the client once all chunks are synced, so ensureTraceSynced no-ops. */
export function finalizeTraceSync(claudeHomeOverride?: string | null): void {
  const override = claudeHomeOverride ?? readSettings().claudeHomeOverride;
  const files = discoverRootSessionFiles(override);
  const maxMtime = files.reduce((m, f) => Math.max(m, f.mtimeMs), 0);
  if (maxMtime > 0) metaSet("source_mtime_watermark", String(maxMtime));
}

// --- queries -----------------------------------------------------------------

export type TraceProjectRow = {
  projectSlug: string;
  projectName: string;
  projectPath: string;
  sessionCount: number;
  requestCount: number;
  lastRequestSec: number | null;
};

export function queryTraceProjects(): TraceProjectRow[] {
  const rows = getTraceDatabase()
    .prepare(
      `SELECT project_slug AS projectSlug,
              COUNT(*) AS sessionCount,
              COALESCE(SUM(request_count), 0) AS requestCount,
              MAX(last_request_sec) AS lastRequestSec
       FROM claude_trace_sessions
       WHERE TRIM(project_slug) != '' AND request_count > 0
       GROUP BY project_slug
       ORDER BY lastRequestSec DESC`,
    )
    .all() as {
    projectSlug: string;
    sessionCount: number;
    requestCount: number;
    lastRequestSec: number | null;
  }[];

  return rows.map((r) => ({
    projectSlug: r.projectSlug,
    projectName: projectNameFromSlug(r.projectSlug),
    projectPath: decodeProjectSlugForDisplay(r.projectSlug),
    sessionCount: r.sessionCount,
    requestCount: r.requestCount,
    lastRequestSec: r.lastRequestSec,
  }));
}

export type TraceSessionSort = "last_request" | "created" | "most_requests";

export type TraceSessionRow = {
  sessionId: string;
  sessionName: string | null;
  interactionCount: number;
  requestCount: number;
  userRequestCount: number;
  modelLabel: string | null;
  costUsd: number | null;
  startedSec: number | null;
  lastRequestSec: number | null;
};

export function queryTraceSessions(options: {
  projectSlug?: string;
  projectPath?: string;
  search?: string;
  sort?: TraceSessionSort;
  offset: number;
  limit: number;
}): { rows: TraceSessionRow[]; total: number } {
  const db = getTraceDatabase();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};
  if (options.projectPath?.trim()) {
    conditions.push(
      "(TRIM(project_path) = @projectPath OR (TRIM(project_path) = '' AND project_slug = @projectSlug))",
    );
    params.projectPath = options.projectPath.trim();
    params.projectSlug = options.projectSlug ?? "";
  } else if (options.projectSlug?.trim()) {
    conditions.push("project_slug = @projectSlug");
    params.projectSlug = options.projectSlug.trim();
  } else {
    conditions.push("1 = 0");
  }
  conditions.push("request_count > 0");
  if (options.search?.trim()) {
    conditions.push("(session_id LIKE @q OR session_name LIKE @q)");
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
    db
      .prepare(`SELECT COUNT(*) AS c FROM claude_trace_sessions ${where}`)
      .get(params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT session_id AS sessionId, session_name AS sessionName,
              interaction_count AS interactionCount, request_count AS requestCount,
              user_request_count AS userRequestCount, model_label AS modelLabel,
              cost_usd AS costUsd, started_sec AS startedSec,
              last_request_sec AS lastRequestSec
       FROM claude_trace_sessions ${where} ${order}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: options.limit, offset: options.offset }) as TraceSessionRow[];

  return { rows, total };
}

export type TraceSessionDetail = {
  session: TraceSessionRow & { projectSlug: string };
  interactions: {
    idx: number;
    startedSec: number | null;
    endedSec: number | null;
    requestCount: number;
    model: string | null;
    toolSummary: { name: string; count: number }[];
    costUsd: number | null;
  }[];
};

export function getTraceSession(sessionId: string): TraceSessionDetail | null {
  const db = getTraceDatabase();
  const session = db
    .prepare(
      `SELECT session_id AS sessionId, project_slug AS projectSlug,
              session_name AS sessionName, interaction_count AS interactionCount,
              request_count AS requestCount, user_request_count AS userRequestCount,
              model_label AS modelLabel, cost_usd AS costUsd,
              started_sec AS startedSec, last_request_sec AS lastRequestSec
       FROM claude_trace_sessions WHERE session_id = ?`,
    )
    .get(sessionId) as (TraceSessionRow & { projectSlug: string }) | undefined;
  if (!session) return null;

  const interactions = (
    db
      .prepare(
        `SELECT idx, started_sec AS startedSec, ended_sec AS endedSec,
                request_count AS requestCount, model, tool_summary_json AS toolSummaryJson,
                cost_usd AS costUsd
         FROM claude_trace_interactions WHERE session_id = ? ORDER BY idx ASC`,
      )
      .all(sessionId) as {
      idx: number;
      startedSec: number | null;
      endedSec: number | null;
      requestCount: number;
      model: string | null;
      toolSummaryJson: string | null;
      costUsd: number | null;
    }[]
  ).map((r) => ({
    idx: r.idx,
    startedSec: r.startedSec,
    endedSec: r.endedSec,
    requestCount: r.requestCount,
    model: r.model,
    toolSummary: safeParseToolSummary(r.toolSummaryJson),
    costUsd: r.costUsd,
  }));

  return { session, interactions };
}

function safeParseToolSummary(
  json: string | null,
): { name: string; count: number }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as { name: string; count: number }[];
  } catch {
    /* ignore */
  }
  return [];
}

type RequestDbRow = {
  id: number;
  role: "User" | "Agent";
  agentKind: string | null;
  toolName: string | null;
  toolUseId: string | null;
  parentToolUseId: string | null;
  isSubagent: number;
  model: string | null;
  createdSec: number | null;
  contentJson: string;
  preview: string | null;
};

function parseContentJson(json: string): TraceContentPart[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as TraceContentPart[];
  } catch {
    /* ignore */
  }
  return [];
}

function firstTextPreview(content: TraceContentPart[]): string | null {
  for (const part of content) {
    if (part.kind === "text" && part.value.trim()) {
      return part.value.replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

/** Human label for an `Agent` tool_use dispatch, from its input params. */
function dispatchLabel(input: unknown): string {
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const type = rec.subagent_type ?? rec.subagentType;
    if (typeof type === "string" && type.trim()) return type.trim();
    const desc = rec.description;
    if (typeof desc === "string" && desc.trim()) return desc.trim();
  }
  return "Subagent";
}

function makePart(
  dbId: number,
  createdSec: number | null,
  suffix: string,
  role: "User" | "Agent",
  kind: TraceTimelinePart["kind"],
  kindLabel: string,
  opts?: {
    textPreview?: string | null;
    toolUseId?: string | null;
    subagent?: TraceSubagentBranchMeta | null;
  },
): TraceTimelinePart {
  return {
    timelineId: `${dbId}#${suffix}`,
    requestId: dbId,
    role,
    kind,
    kindLabel,
    createdSec,
    textPreview: opts?.textPreview ?? null,
    toolUseId: opts?.toolUseId ?? null,
    subagent: opts?.subagent ?? null,
  };
}

/** Explode one DB request row into its ordered content parts (HarnOps model). */
function explodeRow(
  row: RequestDbRow,
  subagentByParent: Map<string, TraceSubagentBranchMeta>,
): TraceTimelinePart[] {
  const content = parseContentJson(row.contentJson);
  const { id, createdSec } = row;

  // Subagent spawn prompt (first user line of a branch).
  if (row.agentKind === "task") {
    return [
      makePart(id, createdSec, "task", "Agent", "task", "task", {
        textPreview: firstTextPreview(content),
      }),
    ];
  }

  // Real user prompt → user column card.
  if (row.role === "User" && row.agentKind !== "tool_result") {
    return [
      makePart(id, createdSec, "text", "User", "text", "text", {
        textPreview: firstTextPreview(content) ?? row.preview ?? null,
      }),
    ];
  }

  // Standalone tool_result record (Claude returns these as user records).
  if (row.agentKind === "tool_result") {
    return [
      makePart(id, createdSec, "tool_result", "Agent", "tool_result", "tool_result", {
        toolUseId: row.toolUseId,
      }),
    ];
  }

  // Assistant record → thinking / text / one part per tool_use.
  const out: TraceTimelinePart[] = [];
  let idx = 0;
  for (const part of content) {
    if (part.kind === "thinking") {
      out.push(makePart(id, createdSec, `thinking:${idx}`, "Agent", "thinking", "thinking"));
    } else if (part.kind === "text") {
      if (part.value.trim()) {
        out.push(makePart(id, createdSec, `text:${idx}`, "Agent", "text", "text"));
      }
    } else if (part.kind === "tool_use") {
      const tid = part.toolUseId ?? `i${idx}`;
      if (part.name === "Agent") {
        const found = part.toolUseId
          ? subagentByParent.get(part.toolUseId) ?? null
          : null;
        const label = dispatchLabel(part.input);
        out.push(
          makePart(id, createdSec, `dispatch:${tid}`, "Agent", "dispatch", label, {
            toolUseId: part.toolUseId,
            subagent: found ? { ...found, label } : null,
          }),
        );
      } else {
        out.push(
          makePart(id, createdSec, `tool:${tid}`, "Agent", "tool", part.name, {
            toolUseId: part.toolUseId,
          }),
        );
      }
    } else if (part.kind === "tool_result") {
      const tid = part.toolUseId ?? `i${idx}`;
      out.push(
        makePart(id, createdSec, `tool_result:${tid}`, "Agent", "tool_result", "tool_result", {
          toolUseId: part.toolUseId,
        }),
      );
    }
    idx++;
  }

  if (out.length === 0) {
    out.push(
      makePart(id, createdSec, "row", "Agent", "text", row.toolName ?? row.agentKind ?? "text"),
    );
  }
  return out;
}

export function listInteractionRequests(
  sessionId: string,
  interactionIdx: number,
): TraceTimelinePart[] {
  const rows = getTraceDatabase()
    .prepare(
      `SELECT id, role, agent_kind AS agentKind, tool_name AS toolName,
              tool_use_id AS toolUseId, parent_tool_use_id AS parentToolUseId,
              is_subagent AS isSubagent, model, created_sec AS createdSec,
              content_json AS contentJson, preview
       FROM claude_trace_requests
       WHERE session_id = ? AND interaction_idx = ?
       ORDER BY seq ASC`,
    )
    .all(sessionId, interactionIdx) as RequestDbRow[];

  // Build nested subagent branches keyed by the parent Agent tool_use id.
  const childrenByParent = new Map<string, RequestDbRow[]>();
  for (const r of rows) {
    if (r.isSubagent && r.parentToolUseId) {
      const list = childrenByParent.get(r.parentToolUseId) ?? [];
      list.push(r);
      childrenByParent.set(r.parentToolUseId, list);
    }
  }

  const emptyBranches = new Map<string, TraceSubagentBranchMeta>();
  const subagentByParent = new Map<string, TraceSubagentBranchMeta>();
  for (const [parentToolUseId, childRows] of childrenByParent) {
    const parts: TraceTimelinePart[] = [];
    for (const child of childRows) parts.push(...explodeRow(child, emptyBranches));
    subagentByParent.set(parentToolUseId, {
      label: "Subagent",
      model: childRows.find((c) => c.model)?.model ?? null,
      requestCount: childRows.length,
      parts,
    });
  }

  const timeline: TraceTimelinePart[] = [];
  for (const r of rows) {
    if (r.isSubagent) continue;
    timeline.push(...explodeRow(r, subagentByParent));
  }
  return timeline;
}

export type TraceRequestBreakdown = {
  id: number;
  role: "User" | "Agent";
  model: string | null;
  contextPct: number | null;
  content: TraceContentPart[];
};

export function getRequestBreakdown(requestId: number): TraceRequestBreakdown | null {
  const row = getTraceDatabase()
    .prepare(
      `SELECT id, role, model, context_pct AS contextPct, content_json AS contentJson
       FROM claude_trace_requests WHERE id = ?`,
    )
    .get(requestId) as
    | { id: number; role: "User" | "Agent"; model: string | null; contextPct: number | null; contentJson: string }
    | undefined;
  if (!row) return null;

  let content: TraceContentPart[] = [];
  try {
    const parsed = JSON.parse(row.contentJson) as unknown;
    if (Array.isArray(parsed)) content = parsed as TraceContentPart[];
  } catch {
    /* ignore */
  }

  return {
    id: row.id,
    role: row.role,
    model: row.model,
    contextPct: row.contextPct,
    content,
  };
}

export function getTraceSessionCount(): number {
  return (
    getTraceDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM claude_trace_sessions`)
      .get() as { c: number }
  ).c;
}
