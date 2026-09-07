/** Parse bubble `createdAt` to unix seconds (fractional when ISO has ms). */
export function parseBubbleCreatedAtSec(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value / 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return null;
      return n > 1e12 ? n / 1000 : n;
    }
    const ms = Date.parse(trimmed);
    if (!Number.isNaN(ms)) return ms / 1000;
  }
  return null;
}

function parseTopLevelObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseBubbleCreatedAtSecFromRaw(raw: string): number | null {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) return null;
  return parseBubbleCreatedAtSec(parsed.createdAt);
}
