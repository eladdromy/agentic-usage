import { parseBubbleCreatedAtSec } from "@/lib/cursor/parse-bubble-created-at";
import { bubbleUuidFromKey, parseTopLevelObject } from "./json";

export const REHYDRATE_CLUSTER_MIN_SIZE = 8;
const MIN_RECOVERY_DELTA_SEC = 0.5;

export type RehydrateTimeBubble = {
  key: string;
  type: number | null;
  createdAt: number | null;
  raw: string;
};

function toolCallIdFromRaw(raw: string): string | null {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) return null;
  const tfd = parsed.toolFormerData;
  if (!tfd || typeof tfd !== "object" || Array.isArray(tfd)) return null;
  const id = (tfd as Record<string, unknown>).toolCallId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function textFingerprint(type: number | null, raw: string): string | null {
  if (type !== 1 && type !== 2) return null;
  const parsed = parseTopLevelObject(raw);
  if (!parsed) return null;
  const text = parsed.text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return `${type}\0${trimmed}`;
}

function floorSec(createdAt: number): number {
  return Math.floor(createdAt);
}

export function findRehydrateClusterSeconds(
  headerBubbles: readonly { createdAt: number | null }[],
  minSize: number = REHYDRATE_CLUSTER_MIN_SIZE,
): number[] {
  const counts = new Map<number, number>();
  for (const b of headerBubbles) {
    if (b.createdAt == null || !Number.isFinite(b.createdAt)) continue;
    const sec = floorSec(b.createdAt);
    counts.set(sec, (counts.get(sec) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minSize)
    .map(([sec]) => sec)
    .sort((a, b) => a - b);
}

function pickEarlierDonor(existing: number | undefined, candidate: number): number {
  if (existing == null) return candidate;
  return candidate < existing ? candidate : existing;
}

export function recoverRehydratedBubbleTimes<T extends RehydrateTimeBubble>(
  bubbles: readonly T[],
  headerBubbleIds: readonly string[] | null | undefined,
): { bubbles: T[] } {
  if (!headerBubbleIds || headerBubbleIds.length === 0 || bubbles.length === 0) {
    return { bubbles: [...bubbles] };
  }

  const headerOrder = new Map(headerBubbleIds.map((id, i) => [id, i]));
  const byId = new Map<string, T>();
  for (const b of bubbles) {
    const id = bubbleUuidFromKey(b.key);
    if (id) byId.set(id, b);
  }

  const headerBubbles: T[] = [];
  for (const id of headerBubbleIds) {
    const bubble = byId.get(id);
    if (bubble) headerBubbles.push(bubble);
  }

  const clusterSeconds = findRehydrateClusterSeconds(headerBubbles);
  if (clusterSeconds.length === 0) return { bubbles: [...bubbles] };
  const clusterSet = new Set(clusterSeconds);

  const donors = bubbles.filter((b) => {
    const id = bubbleUuidFromKey(b.key);
    return id != null && !headerOrder.has(id) && b.createdAt != null;
  });
  if (donors.length === 0) return { bubbles: [...bubbles] };

  const donorByToolCallId = new Map<string, number>();
  const donorByText = new Map<string, number>();
  for (const d of donors) {
    const ca = d.createdAt!;
    const tid = toolCallIdFromRaw(d.raw);
    if (tid) {
      donorByToolCallId.set(tid, pickEarlierDonor(donorByToolCallId.get(tid), ca));
    }
    const textFp = textFingerprint(d.type, d.raw);
    if (textFp) {
      donorByText.set(textFp, pickEarlierDonor(donorByText.get(textFp), ca));
    }
  }

  const recoveredById = new Map<string, number>();
  for (const b of headerBubbles) {
    const id = bubbleUuidFromKey(b.key);
    if (!id || b.createdAt == null) continue;
    if (!clusterSet.has(floorSec(b.createdAt))) continue;

    const tid = toolCallIdFromRaw(b.raw);
    if (tid) {
      const donorCa = donorByToolCallId.get(tid);
      if (donorCa != null && b.createdAt - donorCa >= MIN_RECOVERY_DELTA_SEC) {
        recoveredById.set(id, donorCa);
        donorByToolCallId.delete(tid);
        continue;
      }
    }
    const textFp = textFingerprint(b.type, b.raw);
    if (textFp) {
      const donorCa = donorByText.get(textFp);
      if (donorCa != null && b.createdAt - donorCa >= MIN_RECOVERY_DELTA_SEC) {
        recoveredById.set(id, donorCa);
        donorByText.delete(textFp);
      }
    }
  }

  if (recoveredById.size === 0) return { bubbles: [...bubbles] };

  const out = bubbles.map((b) => {
    const id = bubbleUuidFromKey(b.key);
    if (!id) return b;
    const nextCa = recoveredById.get(id);
    if (nextCa == null || nextCa === b.createdAt) return b;
    return { ...b, createdAt: nextCa };
  });
  return { bubbles: out };
}

export function createdAtSecFromBubbleRaw(raw: string): number | null {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) return null;
  return parseBubbleCreatedAtSec(parsed.createdAt);
}
