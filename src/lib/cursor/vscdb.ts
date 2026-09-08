import fs from "fs";

import Database from "better-sqlite3";

let conn: Database.Database | null = null;
let connPath: string | null = null;

export const CURSOR_DISK_KV_TABLE = "cursorDiskKV";

export function getReadonlyCursorDatabase(dbPath: string): Database.Database {
  if (conn && connPath === dbPath) return conn;

  conn = new Database(dbPath, { readonly: true, fileMustExist: true });
  conn.pragma("mmap_size = 1073741824");
  conn.pragma("cache_size = -128000");
  conn.pragma("temp_store = memory");
  connPath = dbPath;

  return conn;
}

export function cursorDiskKvTableExists(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`,
    )
    .get(CURSOR_DISK_KV_TABLE) as { 1: number } | undefined;
  return row !== undefined;
}

export function cursorDbFileExists(dbPath: string): boolean {
  try {
    return fs.existsSync(dbPath) && fs.statSync(dbPath).isFile();
  } catch {
    return false;
  }
}
