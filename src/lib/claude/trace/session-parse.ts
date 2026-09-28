/**
 * Parse a Claude Code session `.jsonl` file into an ordered request timeline
 * plus grouped interactions. Ported/adapted from Agentic_Usage's
 * `claude-session-parse.ts`, Claude-only and decoupled from Cursor types.
 */

import fs from "fs";
import path from "path";

import { getClaudeHome } from "@/lib/claude/path";
import {
  usageFromClaudeRecord,
  costUsdFromClaudeRecord,
} from "@/lib/claude/usage-from-record";
import { estimateClaudeUsageCost } from "@/lib/pricing/usage-cost";
import {
  claudeRecordToContent,
  deriveModelLabel,
  extractClaudeAgentKind,
  extractClaudeContextUsedPct,
  extractClaudeModel,
  extractClaudeToolName,
  extractClaudeToolUseId,
  isClaudeUserPromptRecord,
  isToolResultUserRecord,
  mergeToolUsage,
  toolUsageFromContent,
} from "./content";
import type {
  ParsedSessionFile,
  TraceInteraction,
  TraceRequestRow,
  TraceSubagentBranch,
  TraceUsage,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

interface ParsedRecord {
  lineNumber: number;
  record: Record<string, unknown>;
  timestampSec: number | null;
  uuid: string;
}

function recordTimestampSec(record: Record<string, unknown>): number | null {
  const ts = record.timestamp;
  if (typeof ts === "string") {
    const ms = Date.parse(ts);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  if (typeof ts === "number" && Number.isFinite(ts)) {
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  }
  return null;
}

function recordUuid(record: Record<string, unknown>, lineNumber: number): string {
  const uuid = record.uuid;
  if (typeof uuid === "string" && uuid.trim()) return uuid.trim();
  return `L${lineNumber}`;
}

export function readJsonlRecordsSync(filePath: string): ParsedRecord[] {
  if (!fs.existsSync(filePath)) return [];
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const out: ParsedRecord[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsed)) continue;
      const lineNumber = i + 1;
      out.push({
        lineNumber,
        record: parsed,
        timestampSec: recordTimestampSec(parsed),
        uuid: recordUuid(parsed, lineNumber),
      });
    } catch {
      /* skip invalid line */
    }
  }
  return out;
}

interface SubagentMetaEntry {
  toolUseId: string;
  agentType: string;
  description: string;
  jsonlPath: string;
}

function loadSubagentMetaIndex(
  sessionJsonlPath: string,
): Map<string, SubagentMetaEntry> {
  const sessionDir = path.dirname(sessionJsonlPath);
  const sessionId = path.basename(sessionJsonlPath, ".jsonl");
  const subagentsDir = path.join(sessionDir, sessionId, "subagents");
  const out = new Map<string, SubagentMetaEntry>();
  if (!fs.existsSync(subagentsDir)) return out;

  let names: string[];
  try {
    names = fs.readdirSync(subagentsDir);
  } catch {
    return out;
  }

  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    try {
      const meta = JSON.parse(
        fs.readFileSync(path.join(subagentsDir, name), "utf8"),
      ) as { toolUseId?: unknown; agentType?: unknown; description?: unknown };
      const toolUseId =
        typeof meta.toolUseId === "string" ? meta.toolUseId.trim() : "";
      if (!toolUseId) continue;
      const jsonlName = name.replace(/\.meta\.json$/, ".jsonl");
      const jsonlPath = path.join(subagentsDir, jsonlName);
      if (!fs.existsSync(jsonlPath)) continue;
      out.set(toolUseId, {
        toolUseId,
        agentType: typeof meta.agentType === "string" ? meta.agentType : "Agent",
        description:
          typeof meta.description === "string" ? meta.description : "",
        jsonlPath,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

function shouldIncludeInTimeline(record: Record<string, unknown>): boolean {
  const t = record.type;
  if (t === "assistant") return true;
  if (t === "user") {
    return isClaudeUserPromptRecord(record) || isToolResultUserRecord(record);
  }
  return false;
}

function usageFromRecord(record: Record<string, unknown>): TraceUsage | null {
  const parsed = usageFromClaudeRecord(record);
  if (!parsed) return null;
  const u = parsed.usage;
  return {
    inputTokens: u.input_tokens ?? null,
    cacheWriteTokens: u.cache_creation_input_tokens ?? null,
    cacheReadTokens: u.cache_read_input_tokens ?? null,
    outputTokens: u.output_tokens ?? null,
  };
}

/** API-equivalent cost for this record from its token usage + model rate. */
function apiCostFromRecord(record: Record<string, unknown>): number | null {
  const parsed = usageFromClaudeRecord(record);
  if (!parsed) return null;
  return estimateClaudeUsageCost(parsed.usage, parsed.model);
}

function normalizeRecordToRow(
  parsed: ParsedRecord,
  opts: { isSubagentTask?: boolean; parentToolUseId?: string | null },
): TraceRequestRow | null {
  const { record } = parsed;
  if (!shouldIncludeInTimeline(record)) return null;

  const isUser = isClaudeUserPromptRecord(record);
  const role: "User" | "Agent" = isUser && !opts.isSubagentTask ? "User" : "Agent";

  const content = claudeRecordToContent(record);
  const agentKind = opts.isSubagentTask
    ? "task"
    : extractClaudeAgentKind(record, role);

  const promptId =
    typeof record.promptId === "string" ? record.promptId : null;
  const messageId =
    isRecord(record.message) && typeof record.message.id === "string"
      ? record.message.id
      : null;

  return {
    recordUuid: parsed.uuid,
    promptId,
    messageId,
    role,
    agentKind,
    toolName: extractClaudeToolName(record),
    toolUseId: extractClaudeToolUseId(record),
    parentToolUseId: opts.parentToolUseId ?? null,
    isSubagentTask: opts.isSubagentTask === true,
    model: extractClaudeModel(record),
    createdSec: parsed.timestampSec,
    contextPct: extractClaudeContextUsedPct(record),
    content,
    toolUsage: toolUsageFromContent(content),
    usage: usageFromRecord(record),
    costUsd: costUsdFromClaudeRecord(record),
    apiCostUsd: apiCostFromRecord(record),
    subagentBranch: null,
  };
}

function parseSubagentBranch(meta: SubagentMetaEntry): TraceSubagentBranch {
  const records = readJsonlRecordsSync(meta.jsonlPath);
  const requests: TraceRequestRow[] = [];
  let firstUser = true;

  for (const parsed of records) {
    const t = parsed.record.type;
    if (t !== "user" && t !== "assistant") continue;

    const isSpawnTask =
      firstUser &&
      t === "user" &&
      isRecord(parsed.record.message) &&
      typeof parsed.record.message.content === "string";
    if (isSpawnTask) firstUser = false;

    const row = normalizeRecordToRow(parsed, {
      isSubagentTask: isSpawnTask,
      parentToolUseId: meta.toolUseId,
    });
    if (row) requests.push(row);
  }

  return {
    toolUseId: meta.toolUseId,
    agentType: meta.agentType,
    description: meta.description,
    modelLabel: deriveModelLabel(requests),
    requests,
  };
}

export function parseSessionFromRecords(
  sessionId: string,
  records: ParsedRecord[],
  subagentIndex: Map<string, SubagentMetaEntry>,
): ParsedSessionFile {
  let sessionName: string | null = null;
  const requests: TraceRequestRow[] = [];
  let userRequestCount = 0;
  let agentRequestCount = 0;
  const timestamps: number[] = [];

  for (const parsed of records) {
    const t = parsed.record.type;
    if (t === "ai-title") {
      const title = parsed.record.aiTitle;
      if (typeof title === "string" && title.trim()) sessionName = title.trim();
      continue;
    }
    if (t === "agent-name") {
      const name = parsed.record.agentName;
      if (typeof name === "string" && name.trim()) sessionName = name.trim();
      continue;
    }

    const row = normalizeRecordToRow(parsed, {});
    if (!row) continue;

    if (parsed.timestampSec !== null) timestamps.push(parsed.timestampSec);
    if (row.role === "User") userRequestCount += 1;
    else agentRequestCount += 1;

    if (row.agentKind === "tool_use" && row.toolName === "Agent" && row.toolUseId) {
      const meta = subagentIndex.get(row.toolUseId);
      if (meta) row.subagentBranch = parseSubagentBranch(meta);
    }

    requests.push(row);
  }

  return {
    sessionId,
    sessionName,
    requests,
    userRequestCount,
    agentRequestCount,
    startedAtSec: timestamps.length > 0 ? Math.min(...timestamps) : null,
    lastRequestAtSec: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

export function parseSessionJsonlFile(sessionJsonlPath: string): ParsedSessionFile {
  const sessionId = path.basename(sessionJsonlPath, ".jsonl");
  const records = readJsonlRecordsSync(sessionJsonlPath);
  const subagentIndex = loadSubagentMetaIndex(sessionJsonlPath);
  return parseSessionFromRecords(sessionId, records, subagentIndex);
}

/**
 * Group a session's request timeline into interactions: each real user prompt
 * starts a new interaction; following agent rows attach to it. Agent rows that
 * appear before any user prompt form an implicit leading interaction.
 */
/** API cost for a row plus all of its nested subagent requests. */
function rowApiCostTotal(row: TraceRequestRow): number | null {
  let total: number | null = row.apiCostUsd;
  if (row.subagentBranch) {
    for (const child of row.subagentBranch.requests) {
      const childCost = rowApiCostTotal(child);
      if (childCost != null) total = (total ?? 0) + childCost;
    }
  }
  return total;
}

export function groupInteractions(requests: TraceRequestRow[]): TraceInteraction[] {
  const interactions: TraceInteraction[] = [];
  let current: TraceInteraction | null = null;

  const startInteraction = (): TraceInteraction => {
    const interaction: TraceInteraction = {
      idx: interactions.length + 1,
      startedSec: null,
      endedSec: null,
      requestCount: 0,
      model: null,
      toolSummary: [],
      costUsd: null,
      requests: [],
    };
    interactions.push(interaction);
    return interaction;
  };

  for (const row of requests) {
    if (row.role === "User" && !row.isSubagentTask) {
      current = startInteraction();
    }
    if (!current) current = startInteraction();

    current.requests.push(row);
    current.requestCount += 1;
    if (row.createdSec !== null) {
      if (current.startedSec === null) current.startedSec = row.createdSec;
      current.endedSec = row.createdSec;
    }
    if (!current.model && row.role === "Agent" && row.model) {
      current.model = row.model;
    }
    const rowCost = rowApiCostTotal(row);
    if (rowCost != null) current.costUsd = (current.costUsd ?? 0) + rowCost;
  }

  for (const interaction of interactions) {
    interaction.toolSummary = mergeToolUsage(
      interaction.requests.map((r) => r.toolUsage),
    );
    interaction.model = deriveModelLabel(interaction.requests);
  }

  return interactions;
}

// --- Path helpers ------------------------------------------------------------

export function isValidProjectSlug(slug: string): boolean {
  const s = slug.trim();
  return Boolean(s) && !s.includes("..") && !s.includes("/") && !s.includes("\\");
}

export function isValidSessionId(sessionId: string): boolean {
  const s = sessionId.trim();
  if (!s || s.includes("..") || s.includes("/") || s.includes("\\")) return false;
  return s.length >= 8 && s.length <= 80;
}

export function resolveProjectSessionPath(
  projectSlug: string,
  sessionId: string,
  claudeHome = getClaudeHome(),
): string {
  if (!isValidProjectSlug(projectSlug)) throw new Error("Invalid project slug");
  if (!isValidSessionId(sessionId)) throw new Error("Invalid session id");
  return path.join(claudeHome, "projects", projectSlug, `${sessionId}.jsonl`);
}
