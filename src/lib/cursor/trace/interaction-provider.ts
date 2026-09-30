import type { ProviderUsageParsedRow } from "@/lib/cursor/provider-usage-types";
import { queryProviderUsageEventsInRange } from "@/lib/cursor/provider-usage-db";
import type { GlobalBubbleStub } from "@/lib/cursor/billing-event-attribution";
import { eventAttributesToComposerStrict } from "@/lib/cursor/billing-event-attribution";
import { loadComposerBubblesInRange } from "@/lib/cursor/vscdb-bubbles";
import type { InteractionCostOptions } from "./interaction-cost";

/** Provider CSV rows attributed to one composer in an interaction window (same rules as cost). */
export function providerEventsForInteraction(
  composerId: string,
  startedSec: number | null,
  endedSec: number | null,
  options?: InteractionCostOptions,
): ProviderUsageParsedRow[] {
  if (startedSec == null) return [];
  const toSec = endedSec ?? startedSec + 3600;
  const fromSec = Math.floor(startedSec);
  const endSec = Math.ceil(toSec);
  const events = queryProviderUsageEventsInRange(fromSec, endSec);
  if (events.length === 0) return [];

  const composerBubbles =
    options?.composerBubbles ??
    loadComposerBubblesInRange(composerId, fromSec, endSec);

  const matched: ProviderUsageParsedRow[] = [];
  for (const row of events) {
    const eventSec = Date.parse(row.date) / 1000;
    if (!Number.isFinite(eventSec)) continue;

    const cid = row.composerId?.trim();
    const strictMatch =
      composerBubbles.length > 0 &&
      eventAttributesToComposerStrict(
        composerId,
        eventSec,
        composerBubbles,
      );

    if (cid && cid !== composerId && !strictMatch) continue;
    if (!cid && !strictMatch) continue;
    matched.push(row);
  }
  return matched;
}

/** Most frequent billed model in attributed CSV rows (ties: lexicographic). */
export function dominantModelFromProviderEvents(
  rows: readonly ProviderUsageParsedRow[],
): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const model = row.model?.trim();
    if (!model) continue;
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return ranked[0]?.[0] ?? null;
}

export function modelFromProviderCsvForInteraction(
  composerId: string,
  startedSec: number | null,
  endedSec: number | null,
  options?: InteractionCostOptions,
): string | null {
  const rows = providerEventsForInteraction(
    composerId,
    startedSec,
    endedSec,
    options,
  );
  return dominantModelFromProviderEvents(rows);
}
