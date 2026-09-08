import type { ProviderUsageParsedRow } from "@/lib/cursor/provider-usage-types";

/** Bubble stub for cross-composer billing attribution (Agentic_Usage heuristic). */
export type GlobalBubbleStub = {
  composerId: string;
  createdAtSec: number;
  /** 1 = user prompt, 2 = agent response */
  bubbleType: 1 | 2;
};

const RECENT_UP_SEC = 5;
const TIGHT_BUBBLE_SEC = 3;

type AttributionContext = {
  composerUPs: Map<string, number[]>;
  agentTimes: number[];
  agentCids: string[];
};

function buildContext(
  globalBubbles: readonly GlobalBubbleStub[],
): AttributionContext | null {
  if (globalBubbles.length === 0) return null;

  const composerUPs = new Map<string, number[]>();
  const agentTimes: number[] = [];
  const agentCids: string[] = [];

  for (const bubble of globalBubbles) {
    if (bubble.bubbleType === 1) {
      let arr = composerUPs.get(bubble.composerId);
      if (!arr) {
        arr = [];
        composerUPs.set(bubble.composerId, arr);
      }
      arr.push(bubble.createdAtSec);
    } else {
      agentTimes.push(bubble.createdAtSec);
      agentCids.push(bubble.composerId);
    }
  }

  for (const times of composerUPs.values()) {
    times.sort((a, b) => a - b);
  }

  if (composerUPs.size === 0) return null;
  return { composerUPs, agentTimes, agentCids };
}

function mostRecentUPWinner(
  ctx: AttributionContext,
  eventSec: number,
): { cid: string; upTime: number } | null {
  let bestUPTime = -Infinity;
  let bestCid: string | null = null;
  for (const [cid, upTimes] of ctx.composerUPs) {
    let lo = 0;
    let hi = upTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (upTimes[mid]! <= eventSec) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) continue;
    const upTime = upTimes[lo - 1]!;
    if (upTime > bestUPTime) {
      bestUPTime = upTime;
      bestCid = cid;
    }
  }
  return bestCid ? { cid: bestCid, upTime: bestUPTime } : null;
}

function tightBubbleWinner(
  ctx: AttributionContext,
  eventSec: number,
): string | null {
  let lo = 0;
  let hi = ctx.agentTimes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ctx.agentTimes[mid]! < eventSec) lo = mid + 1;
    else hi = mid;
  }
  let bestDelta = TIGHT_BUBBLE_SEC;
  let bestCid: string | null = null;
  for (let j = lo; j < ctx.agentTimes.length; j++) {
    const delta = ctx.agentTimes[j]! - eventSec;
    if (delta >= TIGHT_BUBBLE_SEC) break;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestCid = ctx.agentCids[j]!;
    }
  }
  return bestCid;
}

function attributeWithContext(
  eventSec: number,
  ctx: AttributionContext,
): string | null {
  const upWinner = mostRecentUPWinner(ctx, eventSec);
  if (upWinner && eventSec - upWinner.upTime <= RECENT_UP_SEC) {
    return upWinner.cid;
  }

  const bubbleCid = tightBubbleWinner(ctx, eventSec);
  if (bubbleCid !== null) return bubbleCid;

  return upWinner?.cid ?? null;
}

export type BillingAttributionContext = AttributionContext;

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Build once per attach run, then reuse for every billing row. */
export function createBillingAttributionContext(
  globalBubbles: readonly GlobalBubbleStub[],
): BillingAttributionContext | null {
  return buildContext(globalBubbles);
}

/** Yields while building so sync polls can observe progress during large months. */
export async function createBillingAttributionContextAsync(
  globalBubbles: readonly GlobalBubbleStub[],
): Promise<BillingAttributionContext | null> {
  if (globalBubbles.length === 0) return null;

  const composerUPs = new Map<string, number[]>();
  const agentTimes: number[] = [];
  const agentCids: string[] = [];

  for (let index = 0; index < globalBubbles.length; index++) {
    const bubble = globalBubbles[index]!;
    if (bubble.bubbleType === 1) {
      let arr = composerUPs.get(bubble.composerId);
      if (!arr) {
        arr = [];
        composerUPs.set(bubble.composerId, arr);
      }
      arr.push(bubble.createdAtSec);
    } else {
      agentTimes.push(bubble.createdAtSec);
      agentCids.push(bubble.composerId);
    }

    if ((index + 1) % 5000 === 0) {
      await yieldEventLoop();
    }
  }

  const composerEntries = [...composerUPs.entries()];
  for (let sorted = 0; sorted < composerEntries.length; sorted++) {
    composerEntries[sorted]![1].sort((a, b) => a - b);
    if ((sorted + 1) % 100 === 0) {
      await yieldEventLoop();
    }
  }

  if (composerUPs.size === 0) return null;
  return { composerUPs, agentTimes, agentCids };
}

export function attributeBillingEventWithContext(
  evt: Pick<ProviderUsageParsedRow, "date">,
  ctx: BillingAttributionContext,
): string | null {
  const eventSec = Date.parse(evt.date) / 1000;
  if (!Number.isFinite(eventSec)) return null;
  return attributeWithContext(eventSec, ctx);
}

/** Assign one billing CSV row to exactly one composer, or null when unattributed. */
export function attributeBillingEventToComposer(
  evt: Pick<ProviderUsageParsedRow, "date">,
  globalBubbles: readonly GlobalBubbleStub[],
): string | null {
  const ctx = createBillingAttributionContext(globalBubbles);
  if (!ctx) return null;
  return attributeBillingEventWithContext(evt, ctx);
}
