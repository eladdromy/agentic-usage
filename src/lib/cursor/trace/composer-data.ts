import type { CursorInteractionMode } from "./interaction-mode";
import { normalizeSessionUnifiedMode } from "./interaction-mode";
import { isPlainObject, parseTopLevelObject, strOrNull } from "./json";

export function composerNameFromDataRaw(raw: string): string | null {
  const parsed = parseTopLevelObject(raw);
  return parsed ? strOrNull(parsed.name) : null;
}

export function sessionUnifiedModeFromDataRaw(
  raw: string,
): CursorInteractionMode | null {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) return null;
  const um = parsed.unifiedMode;
  if (typeof um === "string") return normalizeSessionUnifiedMode(um);
  return null;
}

export function workspaceIdFromDataRaw(raw: string): string | null {
  const parsed = parseTopLevelObject(raw);
  if (!parsed) return null;
  const wi = parsed.workspaceIdentifier;
  if (!isPlainObject(wi)) return null;
  return strOrNull(wi.id);
}

export interface TimelineBubbleMeta {
  bubbleId: string;
  type: number | null;
  createdAtSec: number | null;
  isSimulatedMsg: boolean;
}

function compareTimeline(a: TimelineBubbleMeta, b: TimelineBubbleMeta): number {
  const ta = a.createdAtSec ?? Number.MAX_SAFE_INTEGER;
  const tb = b.createdAtSec ?? Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  return a.bubbleId.localeCompare(b.bubbleId);
}

/** Full KV timeline: each real user prompt + agent bubbles in [user, next user). */
export function buildFullInteractionBubbleIds(
  bubbles: readonly TimelineBubbleMeta[],
): string[] {
  const users = bubbles
    .filter((b) => b.type === 1 && !b.isSimulatedMsg)
    .sort(compareTimeline);
  const agents = bubbles.filter((b) => b.type === 2);
  const ordered: string[] = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i]!;
    const userTime = user.createdAtSec ?? Number.NEGATIVE_INFINITY;
    const nextUserTime =
      users[i + 1]?.createdAtSec ?? Number.POSITIVE_INFINITY;
    ordered.push(user.bubbleId);
    const interactionAgents = agents
      .filter((agent) => {
        const t = agent.createdAtSec;
        if (t == null) return false;
        return t >= userTime && t < nextUserTime;
      })
      .sort(compareTimeline);
    for (const agent of interactionAgents) ordered.push(agent.bubbleId);
  }
  return ordered;
}
