import fs from "fs";
import path from "path";

import type Database from "better-sqlite3";

import { formatProjectPathLeaf } from "@/lib/format-project-path";
import { cursorVscdbExists, getCursorUserDir } from "@/lib/cursor/path";
import {
  CURSOR_DISK_KV_TABLE,
  getReadonlyCursorDatabase,
} from "@/lib/cursor/vscdb";

function strOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function decodeFolderUri(folder: unknown): string | null {
  if (typeof folder !== "string" || !folder.trim()) return null;
  try {
    if (folder.startsWith("file://")) {
      return decodeURIComponent(new URL(folder).pathname);
    }
    return folder;
  } catch {
    return null;
  }
}

function readWorkspaceProjectPath(workspaceId: string): string | null {
  const jsonPath = path.join(
    getCursorUserDir(),
    "workspaceStorage",
    workspaceId,
    "workspace.json",
  );
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as { folder?: unknown; workspace?: unknown };
    const fromFolder = decodeFolderUri(parsed.folder);
    if (fromFolder) return fromFolder;

    const workspaceUri = decodeFolderUri(parsed.workspace);
    if (!workspaceUri) return null;

    if (workspaceUri.endsWith(".json") && fs.existsSync(/* turbopackIgnore: true */ workspaceUri)) {
      try {
        const nested = JSON.parse(
          fs.readFileSync(/* turbopackIgnore: true */ workspaceUri, "utf8"),
        ) as {
          folders?: { path?: unknown }[];
        };
        const firstFolder = nested.folders?.[0]?.path;
        if (typeof firstFolder === "string" && firstFolder.trim()) {
          return path.resolve(path.dirname(workspaceUri), firstFolder);
        }
      } catch {
        // ignore unreadable nested workspace file
      }
    }

    return workspaceUri;
  } catch {
    return null;
  }
}

function listWorkspaceStateDirs(): { id: string }[] {
  const root = path.join(getCursorUserDir(), "workspaceStorage");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  const out: { id: string }[] = [];
  for (const name of fs.readdirSync(root)) {
    if (name === "." || name === "..") continue;
    const dbPath = path.join(root, name, "state.vscdb");
    try {
      if (fs.statSync(dbPath).isFile()) out.push({ id: name });
    } catch {
      // skip missing/unreadable entries
    }
  }
  return out;
}

/** Per-workspace `composer.composerData` selected/focused composer ids (Agentic_Usage step 4). */
function loadFromWorkspaceComposerData(out: Map<string, string>): void {
  for (const { id: workspaceId } of listWorkspaceStateDirs()) {
    loadWorkspaceComposerDataEntry(out, workspaceId);
  }
}

function loadWorkspaceComposerDataEntry(
  out: Map<string, string>,
  workspaceId: string,
): void {
  const projectPath = readWorkspaceProjectPath(workspaceId);
  if (!projectPath) return;

  const wsDbPath = path.join(
    getCursorUserDir(),
    "workspaceStorage",
    workspaceId,
    "state.vscdb",
  );
  if (!cursorVscdbExists(wsDbPath)) return;

  try {
    const db = getReadonlyCursorDatabase(wsDbPath);
    const row = db
      .prepare(`SELECT CAST(value AS TEXT) AS value FROM ItemTable WHERE key = ?`)
      .get("composer.composerData") as { value: string } | undefined;
    if (!row?.value) return;

    const parsed = JSON.parse(row.value) as {
      selectedComposerIds?: unknown;
      lastFocusedComposerIds?: unknown;
    };
    const composerIds = new Set<string>();
    for (const list of [parsed.selectedComposerIds, parsed.lastFocusedComposerIds]) {
      if (!Array.isArray(list)) continue;
      for (const cid of list) {
        const id = strOrNull(cid);
        if (id) composerIds.add(id);
      }
    }

    for (const composerId of composerIds) {
      mergeComposerProjectPath(out, composerId, projectPath);
    }
  } catch {
    // skip unreadable workspace db
  }
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function loadFromWorkspaceComposerDataAsync(
  out: Map<string, string>,
): Promise<void> {
  const workspaces = listWorkspaceStateDirs();
  for (let index = 0; index < workspaces.length; index++) {
    loadWorkspaceComposerDataEntry(out, workspaces[index]!.id);
    if ((index + 1) % 5 === 0) {
      await yieldEventLoop();
    }
  }
}

function projectPathFromWorkspaceIdentifier(
  workspaceIdentifier: unknown,
): string | null {
  if (!workspaceIdentifier || typeof workspaceIdentifier !== "object") {
    return null;
  }
  const record = workspaceIdentifier as Record<string, unknown>;
  const uri = record.uri;
  const headerPath =
    uri && typeof uri === "object"
      ? strOrNull((uri as Record<string, unknown>).fsPath)
      : null;
  const workspaceId = strOrNull(record.id);
  return headerPath ?? (workspaceId ? readWorkspaceProjectPath(workspaceId) : null);
}

function composerHeadersTableExists(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'composerHeaders' LIMIT 1`,
    )
    .get() as { 1: number } | undefined;
  return row !== undefined;
}

function mergeComposerProjectPath(
  out: Map<string, string>,
  composerId: string,
  projectPath: string | null | undefined,
): void {
  const trimmed = projectPath?.trim();
  if (!trimmed || out.has(composerId)) return;
  out.set(composerId, trimmed);
}

function loadFromItemTableHeadersBlob(
  db: Database.Database,
  out: Map<string, string>,
): void {
  const row = db
    .prepare(`SELECT CAST(value AS TEXT) AS value FROM ItemTable WHERE key = ?`)
    .get("composer.composerHeaders") as { value: string } | undefined;
  if (!row?.value) return;

  try {
    const parsed = JSON.parse(row.value) as {
      allComposers?: {
        composerId?: unknown;
        workspaceIdentifier?: unknown;
      }[];
    };

    for (const entry of parsed.allComposers ?? []) {
      const composerId = strOrNull(entry.composerId);
      if (!composerId) continue;
      mergeComposerProjectPath(
        out,
        composerId,
        projectPathFromWorkspaceIdentifier(entry.workspaceIdentifier),
      );
    }
  } catch {
    // ignore malformed blob
  }
}

/** Cursor ≥2026 relational composer header rows (`composerHeaders` table). */
function loadFromComposerHeadersTable(
  db: Database.Database,
  out: Map<string, string>,
): void {
  if (!composerHeadersTableExists(db)) return;

  try {
    const rows = db
      .prepare(
        `SELECT composerId, workspaceId, value
         FROM composerHeaders
         WHERE composerId IS NOT NULL AND TRIM(composerId) != ''`,
      )
      .all() as {
      composerId: string;
      workspaceId: string | null;
      value: string | null;
    }[];

    for (const row of rows) {
      const composerId = strOrNull(row.composerId);
      if (!composerId) continue;

      let projectPath: string | null = null;
      if (row.value?.trim()) {
        try {
          const parsed = JSON.parse(row.value) as {
            workspaceIdentifier?: unknown;
          };
          projectPath = projectPathFromWorkspaceIdentifier(
            parsed.workspaceIdentifier,
          );
        } catch {
          // ignore malformed row JSON
        }
      }
      if (!projectPath && row.workspaceId?.trim()) {
        projectPath = readWorkspaceProjectPath(row.workspaceId.trim());
      }
      mergeComposerProjectPath(out, composerId, projectPath);
    }
  } catch {
    // ignore unreadable table
  }
}

function projectPathFromComposerDataRaw(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { workspaceIdentifier?: unknown };
    return projectPathFromWorkspaceIdentifier(parsed.workspaceIdentifier);
  } catch {
    return null;
  }
}

/** Composer id → absolute project folder path (headers + workspace composerData). */
export function loadComposerProjectMap(
  dbPath: string,
  options?: { scanWorkspaces?: boolean },
): Map<string, string> {
  const out = new Map<string, string>();
  if (!cursorVscdbExists(dbPath)) {
    if (options?.scanWorkspaces !== false) {
      loadFromWorkspaceComposerData(out);
    }
    return out;
  }

  try {
    const db = getReadonlyCursorDatabase(dbPath);
    loadFromItemTableHeadersBlob(db, out);
    loadFromComposerHeadersTable(db, out);
    if (options?.scanWorkspaces !== false) {
      loadFromWorkspaceComposerData(out);
    }
  } catch {
    return out;
  }

  return out;
}

/** Async variant — yields while scanning workspace folders (used during project sync prep). */
export async function loadComposerProjectMapAsync(
  dbPath: string,
  options?: { scanWorkspaces?: boolean },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!cursorVscdbExists(dbPath)) {
    if (options?.scanWorkspaces !== false) {
      await loadFromWorkspaceComposerDataAsync(out);
    }
    return out;
  }

  try {
    const db = getReadonlyCursorDatabase(dbPath);
    loadFromItemTableHeadersBlob(db, out);
    loadFromComposerHeadersTable(db, out);
    if (options?.scanWorkspaces !== false) {
      await loadFromWorkspaceComposerDataAsync(out);
    }
  } catch {
    return out;
  }

  return out;
}

/** Resolve project path; falls back to `composerData:<id>` KV on cache miss. */
export function lookupComposerProjectPath(
  db: Database.Database,
  composerId: string,
  cache: Map<string, string>,
): string | null {
  const cached = cache.get(composerId);
  if (cached) return cached;

  try {
    const row = db
      .prepare(
        `SELECT CAST(value AS TEXT) AS value
         FROM ${CURSOR_DISK_KV_TABLE}
         WHERE key = ?`,
      )
      .get(`composerData:${composerId}`) as { value: string } | undefined;
    if (!row?.value) return null;

    const projectPath = projectPathFromComposerDataRaw(row.value);
    if (projectPath) cache.set(composerId, projectPath);
    return projectPath;
  } catch {
    return null;
  }
}

/**
 * Resolve project path with subagent roll-up: child composers inherit the
 * parent workspace from `task_v2` dispatch when they have no own path.
 */
export function resolveComposerProjectPath(
  db: Database.Database,
  composerId: string,
  cache: Map<string, string>,
  subagentParentProjects: Map<string, string>,
): string | null {
  const direct = lookupComposerProjectPath(db, composerId, cache);
  if (direct) return direct;

  const fromParent = subagentParentProjects.get(composerId);
  if (fromParent) {
    cache.set(composerId, fromParent);
    return fromParent;
  }
  return null;
}

export function projectLabelsFromPath(
  projectPath: string | null | undefined,
): { label: string; detail: string | null } {
  const trimmed = projectPath?.trim();
  if (!trimmed) return { label: "—", detail: null };
  return {
    label: formatProjectPathLeaf(trimmed),
    detail: trimmed,
  };
}
