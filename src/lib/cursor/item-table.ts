import { getReadonlyCursorDatabase } from "@/lib/cursor/vscdb";

function itemTableExists(dbPath: string): boolean {
  const db = getReadonlyCursorDatabase(dbPath);
  const row = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'ItemTable' LIMIT 1`,
    )
    .get() as { 1: number } | undefined;
  return row !== undefined;
}

export function getItemTableValue(
  dbPath: string,
  key: string,
): string | null {
  if (!itemTableExists(dbPath)) return null;

  const db = getReadonlyCursorDatabase(dbPath);
  const row = db
    .prepare(`SELECT CAST(value AS TEXT) AS v FROM ItemTable WHERE key = ? LIMIT 1`)
    .get(key) as { v: string | null } | undefined;
  if (!row) return null;
  return row.v ?? "";
}

export function fetchItemTableKeyLikeMap(
  dbPath: string,
  likePattern: string,
): Record<string, string> {
  if (!itemTableExists(dbPath)) return {};

  const db = getReadonlyCursorDatabase(dbPath);
  const rows = db
    .prepare(
      `SELECT key, CAST(value AS TEXT) AS v FROM ItemTable WHERE key LIKE ?`,
    )
    .all(likePattern) as { key: string; v: string | null }[];

  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.v ?? "";
  return out;
}
