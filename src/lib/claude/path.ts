import os from "os";
import path from "path";

export function getClaudeHome(): string {
  const raw = process.env.CLAUDE_HOME?.trim();
  if (raw) return path.resolve(raw);
  return path.join(os.homedir(), ".claude");
}

export function getClaudeGlobalConfigPath(): string {
  return path.join(os.homedir(), ".claude.json");
}

export function encodePathToProjectSlug(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const withoutLeading = normalized.replace(/^\/+/, "");
  if (!withoutLeading) return "";
  const segments = withoutLeading.split("/");
  const encoded = segments
    .map((segment) => segment.replace(/[_\s]+/g, "-"))
    .join("-");
  return `-${encoded}`;
}

export function normalizeProjectSlug(slug: string): string {
  return slug.trim().replace(/\/+$/, "");
}

export function decodeProjectSlugNaive(slug: string): string | null {
  const s = normalizeProjectSlug(slug);
  if (!s) return null;
  if (s.startsWith("-")) {
    const rest = s.slice(1).replace(/-/g, path.sep);
    return path.sep === "/" ? `/${rest}` : rest;
  }
  return s.replace(/-/g, path.sep);
}

export function getDataDir(): string {
  const raw = process.env.PLAN_LEVERAGE_DATA_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.join(process.cwd(), ".data");
}
