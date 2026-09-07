/** Last path segment only (repo / folder name). */
export function formatProjectPathLeaf(path: string | null | undefined): string {
  const normalized = (path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return "—";
  return parts[parts.length - 1]!;
}

/** Canonical key for matching the same workspace across harnesses. */
export function normalizeProjectPathKey(path: string | null | undefined): string | null {
  const normalized = (path ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || normalized === "—") return null;
  return normalized.toLowerCase();
}
