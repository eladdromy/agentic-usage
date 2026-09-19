export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseTopLevelObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function strOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

/** UUID from `bubbleId:<composerId>:<uuid>`. */
export function bubbleUuidFromKey(key: string): string | null {
  if (!key.startsWith("bubbleId:")) return null;
  const parts = key.split(":");
  return parts[2]?.trim() || null;
}
