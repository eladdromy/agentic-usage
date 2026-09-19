import {
  estimateCursorRowCost,
  numericApiEqUsdFromProviderRow,
} from "@/lib/pricing/cursor-usage-cost";
import type { GlobalBubbleStub } from "@/lib/cursor/billing-event-attribution";
import { providerEventsForInteraction } from "./interaction-provider";

export type InteractionCostOptions = {
  /** Preloaded session bubbles (avoids repeated vscdb reads during CSV backfill). */
  composerBubbles?: readonly GlobalBubbleStub[];
};

function rowCostUsd(
  row: Parameters<typeof numericApiEqUsdFromProviderRow>[0],
): number | null {
  const api = numericApiEqUsdFromProviderRow(row);
  if (api > 0) return api;
  const est = estimateCursorRowCost(row);
  if (est.usd != null && Number.isFinite(est.usd)) return est.usd;
  return null;
}

/** Sum API-equivalent cost for provider CSV rows in an interaction window. */
export function estimateInteractionApiCostUsd(
  composerId: string,
  startedSec: number | null,
  endedSec: number | null,
  options?: InteractionCostOptions,
): number | null {
  if (startedSec == null) return null;
  const events = providerEventsForInteraction(
    composerId,
    startedSec,
    endedSec,
    options,
  );
  if (events.length === 0) return null;

  let sum = 0;
  let any = false;
  for (const row of events) {
    const cost = rowCostUsd(row);
    if (cost != null) {
      sum += cost;
      any = true;
    }
  }
  return any ? sum : null;
}
