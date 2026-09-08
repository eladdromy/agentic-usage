import fs from "fs";
import path from "path";

import {
  getClaudeGlobalConfigPath,
  getClaudeHome,
  getResolvedClaudeHome,
} from "./path";

export type SyncFile = {
  fileKey: string;
  absolutePath: string;
  mtimeMs: number;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_DEPTH = 12;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "cache",
  "tmp",
  "temp",
  ".cache",
  "plugins",
]);

function isJsonlFile(name: string): boolean {
  return name.endsWith(".jsonl");
}

function walkDir(
  dir: string,
  rootPath: string,
  depth: number,
  out: SyncFile[],
): void {
  if (depth > MAX_DEPTH) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.isDirectory()) continue;

    const absolutePath = path.join(dir, ent.name);

    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      walkDir(absolutePath, rootPath, depth + 1, out);
      continue;
    }

    if (!ent.isFile() || !isJsonlFile(ent.name)) continue;

    let st: fs.Stats;
    try {
      st = fs.statSync(absolutePath);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;

    const relativePath = path
      .relative(rootPath, absolutePath)
      .split(path.sep)
      .join("/");

    out.push({
      fileKey: relativePath,
      absolutePath,
      mtimeMs: st.mtimeMs,
    });
  }
}

export function discoverClaudeJsonlFiles(
  claudeHomeOverride?: string | null,
): SyncFile[] {
  const claudeHome = getResolvedClaudeHome(claudeHomeOverride);
  const out: SyncFile[] = [];

  if (fs.existsSync(claudeHome)) {
    walkDir(claudeHome, claudeHome, 0, out);
  }

  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

export function claudeHomeExists(claudeHomeOverride?: string | null): boolean {
  return fs.existsSync(getResolvedClaudeHome(claudeHomeOverride));
}

export function claudeConfigExists(): boolean {
  return fs.existsSync(getClaudeGlobalConfigPath());
}
