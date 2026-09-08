import os from "os";
import path from "path";

function claudeHomeFromEnv(): string | null {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configDir) return path.resolve(configDir);
  const legacyHome = process.env.CLAUDE_HOME?.trim();
  if (legacyHome) return path.resolve(legacyHome);
  return null;
}

export function getClaudeHome(): string {
  return claudeHomeFromEnv() ?? path.join(os.homedir(), ".claude");
}

export function getResolvedClaudeHome(override: string | null | undefined): string {
  const trimmed = override?.trim();
  if (trimmed) return path.resolve(trimmed);
  return getClaudeHome();
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
  const raw = process.env.AGENTIC_USAGE_DATA_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.join(process.cwd(), ".data");
}
