/** Deterministic fake project names for README screenshots (env-gated). */

const ADJECTIVES = [
  "amber",
  "azure",
  "bright",
  "calm",
  "cedar",
  "clear",
  "coastal",
  "copper",
  "crisp",
  "dawn",
  "ember",
  "frost",
  "golden",
  "hollow",
  "iron",
  "ivory",
  "jade",
  "lunar",
  "misty",
  "north",
  "olive",
  "pixel",
  "quiet",
  "rapid",
  "silver",
  "silent",
  "solar",
  "stone",
  "swift",
  "violet",
] as const;

const NOUNS = [
  "anchor",
  "atlas",
  "beacon",
  "bridge",
  "canvas",
  "canyon",
  "circuit",
  "compass",
  "delta",
  "engine",
  "fabric",
  "forge",
  "garden",
  "harbor",
  "horizon",
  "kernel",
  "ledger",
  "matrix",
  "meadow",
  "mirror",
  "module",
  "nova",
  "orbit",
  "parcel",
  "portal",
  "quartz",
  "relay",
  "signal",
  "summit",
  "vector",
] as const;

export function isAnonymizeEnabled(): boolean {
  const raw = process.env.AGENTIC_USAGE_ANONYMIZE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function hashKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function anonymizeProjectName(canonicalKey: string): string {
  const trimmed = canonicalKey.trim();
  if (!trimmed || trimmed === "—") return trimmed || "—";

  const hash = hashKey(trimmed.toLowerCase());
  const adjective = ADJECTIVES[hash % ADJECTIVES.length]!;
  const noun = NOUNS[(hash >>> 8) % NOUNS.length]!;
  const suffix = (hash >>> 16) % 97;
  return suffix > 0 ? `${adjective}-${noun}-${suffix}` : `${adjective}-${noun}`;
}

export function anonymizeProjectPath(canonicalKey: string): string {
  const trimmed = canonicalKey.trim();
  if (!trimmed || trimmed === "—") return trimmed || "—";
  return `/Users/demo/projects/${anonymizeProjectName(trimmed)}`;
}

export function anonymizeSessionRef(id: string): string {
  if (!id.trim()) return "—";
  const hash = hashKey(id);
  const hex = hash.toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}…`;
}

export function anonymizeProjectFields(
  canonicalKey: string,
  label: string,
  detail?: string | null,
): { label: string; detail: string | null } {
  if (!isAnonymizeEnabled()) {
    return { label, detail: detail ?? null };
  }

  const key = canonicalKey.trim() || label.trim() || detail?.trim() || "project";
  return {
    label: anonymizeProjectName(key),
    detail: anonymizeProjectPath(key),
  };
}
