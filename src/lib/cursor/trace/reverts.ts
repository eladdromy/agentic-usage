import { parseTopLevelObject, strOrNull } from "./json";

export function parseConversationHeaderUserBubbleIds(composerDataRaw: string): string[] {
  const parsed = parseTopLevelObject(composerDataRaw);
  if (!parsed) return [];
  const headers = parsed.fullConversationHeadersOnly;
  if (!Array.isArray(headers)) return [];

  const ids: string[] = [];
  for (const entry of headers) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== 1) continue;
    const bubbleId = strOrNull(record.bubbleId);
    if (bubbleId) ids.push(bubbleId);
  }
  return ids;
}

export function parseConversationHeaderBubbleIds(
  composerDataRaw: string,
): string[] | null {
  const parsed = parseTopLevelObject(composerDataRaw);
  if (!parsed) return null;
  const headers =
    parsed.fullConversationHeadersOnly ?? parsed.conversationHeaders;
  if (!Array.isArray(headers)) return null;
  const ids: string[] = [];
  for (const entry of headers) {
    if (!entry || typeof entry !== "object") continue;
    const bubbleId = strOrNull((entry as Record<string, unknown>).bubbleId);
    if (bubbleId) ids.push(bubbleId);
  }
  return ids.length > 0 ? ids : null;
}

/** Interactions whose user bubble was pruned from headers after checkpoint revert. */
export function revertedInteractionIndexes(
  composerDataRaw: string | null,
  interactions: { idx: number; userBubbleId: string | null }[],
): Set<number> {
  const out = new Set<number>();
  const raw = composerDataRaw?.trim();
  if (!raw) return out;
  const headerUserIds = new Set(parseConversationHeaderUserBubbleIds(raw));
  if (headerUserIds.size === 0) return out;
  for (const interaction of interactions) {
    const id = interaction.userBubbleId?.trim();
    if (!id) continue;
    if (!headerUserIds.has(id)) out.add(interaction.idx);
  }
  return out;
}
