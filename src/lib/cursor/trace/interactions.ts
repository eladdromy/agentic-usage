import {
  classifyCursorInteractionMode,
  extractBubbleModeFields,
  type CursorInteractionMode,
} from "./interaction-mode";
import { estimateInteractionApiCostUsd } from "./interaction-cost";
import { resolveCursorInteractionModel } from "./interaction-model";
import type { CursorInteraction, CursorRequestRow } from "./types";

function mergeToolSummary(
  requests: CursorRequestRow[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of requests) {
    for (const name of row.toolNames) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (row.subagentBranch) {
      for (const child of row.subagentBranch.interactions.flatMap((i) => i.requests)) {
        for (const name of child.toolNames) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function compareRequests(a: CursorRequestRow, b: CursorRequestRow): number {
  const ta = a.createdAtSec ?? Number.MAX_SAFE_INTEGER;
  const tb = b.createdAtSec ?? Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  if (a.role === "User" && b.role !== "User") return -1;
  if (b.role === "User" && a.role !== "User") return 1;
  return a.bubbleKey.localeCompare(b.bubbleKey);
}

export function groupCursorInteractions(
  requests: CursorRequestRow[],
  composerId: string,
  sessionUnifiedMode: CursorInteractionMode | null,
  userBubbleRawById: Map<string, string>,
  reverted: Set<number>,
): CursorInteraction[] {
  const sorted = [...requests].sort(compareRequests);
  const interactions: CursorInteraction[] = [];
  let currentUser: CursorRequestRow | null = null;
  let currentAgents: CursorRequestRow[] = [];
  let lastKnownModel: string | null = null;

  const flush = () => {
    if (!currentUser) return;
    const idx = interactions.length + 1;
    const allRequests = [currentUser, ...currentAgents];
    const startedSec = currentUser.createdAtSec;
    const endedSec = allRequests.reduce<number | null>((max, r) => {
      if (r.createdAtSec == null) return max;
      return max == null ? r.createdAtSec : Math.max(max, r.createdAtSec);
    }, null);

    const modeFields = extractBubbleModeFields(
      userBubbleRawById.get(currentUser.bubbleId) ?? "",
    );
    const interactionMode = classifyCursorInteractionMode({
      bubbleFields: modeFields,
      sessionUnifiedMode,
    });

    const costUsd = estimateInteractionApiCostUsd(composerId, startedSec, endedSec);
    const model = resolveCursorInteractionModel(
      composerId,
      startedSec,
      endedSec,
      lastKnownModel,
    );
    if (model) lastKnownModel = model;

    interactions.push({
      idx,
      startedSec,
      endedSec,
      requestCount: allRequests.length,
      model,
      toolSummary: mergeToolSummary(allRequests),
      costUsd,
      interactionMode,
      reverted: reverted.has(idx),
      userBubbleId: currentUser.bubbleId,
      requests: allRequests,
    });
    currentUser = null;
    currentAgents = [];
  };

  for (const req of sorted) {
    if (req.role === "User") {
      flush();
      currentUser = req;
      currentAgents = [];
      continue;
    }
    if (currentUser) currentAgents.push(req);
  }
  flush();

  return interactions.map((intr, i) => ({
    ...intr,
    idx: i + 1,
    reverted: reverted.has(i + 1),
  }));
}

