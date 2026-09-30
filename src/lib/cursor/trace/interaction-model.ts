import type { InteractionCostOptions } from "./interaction-cost";
import { modelFromProviderCsvForInteraction } from "./interaction-provider";

/** Billed CSV model when present; otherwise previous interaction in the session. */
export function resolveCursorInteractionModel(
  composerId: string,
  startedSec: number | null,
  endedSec: number | null,
  carryFromPrior: string | null,
  options?: InteractionCostOptions,
): string | null {
  const fromCsv = modelFromProviderCsvForInteraction(
    composerId,
    startedSec,
    endedSec,
    options,
  );
  if (fromCsv) return fromCsv;
  return carryFromPrior;
}

/** Fill model gaps from indexed rows only (no vscdb / CSV on read). */
export function applyInteractionModelCarryForward<
  T extends { model: string | null },
>(interactions: readonly T[]): T[] {
  let carry: string | null = null;
  return interactions.map((intr) => {
    const model = intr.model ?? carry;
    if (model) carry = model;
    return model === intr.model ? intr : { ...intr, model };
  });
}

export function enrichCursorInteractionModels<
  T extends {
    startedSec: number | null;
    endedSec: number | null;
    model: string | null;
  },
>(
  composerId: string,
  interactions: readonly T[],
  options?: InteractionCostOptions,
): T[] {
  let carry: string | null = null;
  return interactions.map((intr) => {
    const model = resolveCursorInteractionModel(
      composerId,
      intr.startedSec,
      intr.endedSec,
      carry,
      options,
    );
    if (model) carry = model;
    return model === intr.model ? intr : { ...intr, model };
  });
}
