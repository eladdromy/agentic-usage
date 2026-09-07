import fs from "fs";
import path from "path";

import {
  decodeProjectSlugNaive,
  encodePathToProjectSlug,
  getClaudeGlobalConfigPath,
  normalizeProjectSlug,
} from "@/lib/claude/path";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

let cachedSlugMap: Map<string, string> | null = null;
let cachedSlugMapMtimeMs = 0;

export function getProjectSlugMap(): Map<string, string> {
  const configPath = getClaudeGlobalConfigPath();
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(configPath).mtimeMs;
  } catch {
    return cachedSlugMap ?? new Map();
  }

  if (cachedSlugMap && cachedSlugMapMtimeMs === mtimeMs) {
    return cachedSlugMap;
  }

  const map = new Map<string, string>();
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    if (isPlainObject(config) && isPlainObject(config.projects)) {
      for (const projectPath of Object.keys(config.projects)) {
        const slug = encodePathToProjectSlug(projectPath);
        if (slug) map.set(slug, projectPath);
      }
    }
  } catch {
    // ignore malformed config
  }

  cachedSlugMap = map;
  cachedSlugMapMtimeMs = mtimeMs;
  return map;
}

export function resolveProjectPathFromSlug(slug: string): string | null {
  const normalized = normalizeProjectSlug(slug);
  if (!normalized) return null;
  return getProjectSlugMap().get(normalized) ?? null;
}

export function decodeProjectSlugForDisplay(slug: string): string {
  const resolved = resolveProjectPathFromSlug(slug) ?? decodeProjectSlugNaive(slug);
  if (!resolved) return "—";
  return resolved.replace(/\\/g, "/");
}

export function projectNameFromSlug(slug: string): string {
  const resolved = resolveProjectPathFromSlug(slug);
  if (resolved) {
    const name = path.basename(resolved);
    return name || resolved;
  }

  const fallbackPath = decodeProjectSlugForDisplay(slug);
  if (fallbackPath === "—") return fallbackPath;
  const name = path.basename(fallbackPath);
  return name || fallbackPath;
}
