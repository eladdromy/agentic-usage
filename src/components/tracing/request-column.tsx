"use client";

import { useState } from "react";
import { ArrowDown, ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";

import type { TraceSubagentBranchMeta, TraceTimelinePart } from "@/lib/tracing-shared";
import { cn } from "@/lib/utils";

function timeLabel(sec: number | null): string {
  if (sec == null) return "—";
  return new Date(sec * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// --- part splitting / tool pairing -------------------------------------------

function splitByRole(parts: TraceTimelinePart[]): {
  user: TraceTimelinePart[];
  agent: TraceTimelinePart[];
} {
  const user: TraceTimelinePart[] = [];
  const agent: TraceTimelinePart[] = [];
  for (const part of parts) {
    if (part.role === "User") user.push(part);
    else agent.push(part);
  }
  return { user, agent };
}

type RenderItem =
  | { type: "pair"; use: TraceTimelinePart; result: TraceTimelinePart }
  | { type: "single"; part: TraceTimelinePart };

/** Pair each tool_use part with its matching tool_result (by toolUseId). */
function buildAgentRenderItems(parts: TraceTimelinePart[]): RenderItem[] {
  const resultByToolId = new Map<string, TraceTimelinePart>();
  for (const part of parts) {
    if (part.kind === "tool_result" && part.toolUseId) {
      resultByToolId.set(part.toolUseId, part);
    }
  }
  const consumed = new Set<string>();
  const items: RenderItem[] = [];
  for (const part of parts) {
    if (part.kind === "tool_result" && consumed.has(part.timelineId)) continue;
    if (part.kind === "tool" && part.toolUseId) {
      const result = resultByToolId.get(part.toolUseId);
      if (result) {
        consumed.add(result.timelineId);
        items.push({ type: "pair", use: part, result });
        continue;
      }
    }
    items.push({ type: "single", part });
  }
  return items;
}

// --- leaf cards --------------------------------------------------------------

type SelectProps = {
  selectedTimelineId: string | null;
  onSelect: (part: TraceTimelinePart) => void;
};

function FlowArrow() {
  return (
    <div className="flex justify-center py-0.5 text-muted-foreground" aria-hidden="true">
      <ArrowDown size={16} />
    </div>
  );
}

function UserPromptCard({
  part,
  selectedTimelineId,
  onSelect,
}: { part: TraceTimelinePart } & SelectProps) {
  const selected = part.timelineId === selectedTimelineId;
  return (
    <button
      type="button"
      onClick={() => onSelect(part)}
      aria-pressed={selected}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border/60 bg-muted/40 hover:bg-muted/60",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
        <span className="text-sm font-semibold">User request</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {timeLabel(part.createdSec)}
        </span>
      </div>
      <p className="line-clamp-4 text-sm leading-snug">{part.textPreview || "—"}</p>
    </button>
  );
}

function TaskSpawnCard({
  part,
  selectedTimelineId,
  onSelect,
}: { part: TraceTimelinePart } & SelectProps) {
  const selected = part.timelineId === selectedTimelineId;
  return (
    <button
      type="button"
      onClick={() => onSelect(part)}
      aria-pressed={selected}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-dashed p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border/60 bg-muted/30 hover:bg-muted/50",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold">Task spawn</span>
          <p className="text-[11px] text-muted-foreground">
            Dispatch prompt · not a user message
          </p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {timeLabel(part.createdSec)}
        </span>
      </div>
      <p className="line-clamp-4 text-sm leading-snug">{part.textPreview || "—"}</p>
    </button>
  );
}

function AgentPartRow({
  part,
  plain = false,
  nested = false,
  selectedTimelineId,
  onSelect,
}: {
  part: TraceTimelinePart;
  plain?: boolean;
  nested?: boolean;
} & SelectProps) {
  const selected = part.timelineId === selectedTimelineId;
  return (
    <button
      type="button"
      onClick={() => onSelect(part)}
      aria-pressed={selected}
      className={cn(
        "flex w-full cursor-pointer items-baseline justify-between gap-3 border px-3 py-2 text-left transition-colors",
        plain ? "rounded-md" : "rounded-lg",
        selected
          ? "border-primary bg-primary/5"
          : nested
            ? "border-dashed border-border/60 bg-muted/30 hover:bg-muted/50"
            : "border-border/60 bg-background/60 hover:bg-muted/60",
      )}
    >
      <span className="min-w-0 truncate font-mono text-xs">{part.kindLabel}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {timeLabel(part.createdSec)}
      </span>
    </button>
  );
}

function ToolPairBlock({
  use,
  result,
  nested = false,
  selectedTimelineId,
  onSelect,
}: {
  use: TraceTimelinePart;
  result: TraceTimelinePart;
  nested?: boolean;
} & SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <AgentPartRow
        part={use}
        plain
        nested={nested}
        selectedTimelineId={selectedTimelineId}
        onSelect={onSelect}
      />
      <AgentPartRow
        part={result}
        plain
        nested={nested}
        selectedTimelineId={selectedTimelineId}
        onSelect={onSelect}
      />
    </div>
  );
}

function SubagentBranchBlock({
  branch,
  selectedTimelineId,
  onSelect,
}: { branch: TraceSubagentBranchMeta } & SelectProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-3 border-l-2 border-border/60 pl-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-left text-xs font-medium"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        )}
        <span>Subagent: {branch.label}</span>
      </button>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {branch.requestCount} request{branch.requestCount === 1 ? "" : "s"}
        {branch.model ? (
          <>
            <span aria-hidden="true"> · </span>
            <span className="font-mono">{branch.model}</span>
          </>
        ) : null}
      </p>
      {expanded ? (
        <div className="pb-2">
          <PartsRenderer
            parts={branch.parts}
            nested
            selectedTimelineId={selectedTimelineId}
            onSelect={onSelect}
          />
        </div>
      ) : null}
    </div>
  );
}

// --- renderer ----------------------------------------------------------------

function PartsRenderer({
  parts,
  nested = false,
  selectedTimelineId,
  onSelect,
}: {
  parts: TraceTimelinePart[];
  nested?: boolean;
} & SelectProps) {
  const { user, agent } = splitByRole(parts);
  const userPrompts = user.filter((p) => p.kind === "text");
  const agentItems = buildAgentRenderItems(agent);

  return (
    <div className="flex flex-col gap-2">
      {userPrompts.map((part) => (
        <UserPromptCard
          key={part.timelineId}
          part={part}
          selectedTimelineId={selectedTimelineId}
          onSelect={onSelect}
        />
      ))}
      {userPrompts.length > 0 && agent.length > 0 ? <FlowArrow /> : null}
      {agentItems.map((item) => {
        if (item.type === "pair") {
          return (
            <ToolPairBlock
              key={`pair-${item.use.timelineId}`}
              use={item.use}
              result={item.result}
              nested={nested}
              selectedTimelineId={selectedTimelineId}
              onSelect={onSelect}
            />
          );
        }
        const part = item.part;
        if (part.kind === "task") {
          return (
            <TaskSpawnCard
              key={part.timelineId}
              part={part}
              selectedTimelineId={selectedTimelineId}
              onSelect={onSelect}
            />
          );
        }
        if (part.kind === "dispatch") {
          return (
            <div key={part.timelineId} className="flex flex-col gap-1.5">
              <AgentPartRow
                part={part}
                nested={nested}
                selectedTimelineId={selectedTimelineId}
                onSelect={onSelect}
              />
              {part.subagent ? (
                <SubagentBranchBlock
                  branch={part.subagent}
                  selectedTimelineId={selectedTimelineId}
                  onSelect={onSelect}
                />
              ) : (
                <p className="ml-3 border-l-2 border-amber-500/40 pl-3 text-xs text-amber-600 dark:text-amber-400">
                  Subagent branch unlinked
                </p>
              )}
            </div>
          );
        }
        return (
          <AgentPartRow
            key={part.timelineId}
            part={part}
            nested={nested}
            selectedTimelineId={selectedTimelineId}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

function countParts(parts: TraceTimelinePart[]): number {
  let total = parts.length;
  for (const part of parts) {
    if (part.subagent) total += part.subagent.requestCount;
  }
  return total;
}

export function RequestColumn({
  harness,
  parts,
  loading,
  interactionIdx,
  selectedTimelineId,
  onSelect,
}: {
  harness: "claude" | "cursor";
  parts: TraceTimelinePart[];
  loading: boolean;
  interactionIdx: number | null;
  selectedTimelineId: string | null;
  onSelect: (part: TraceTimelinePart) => void;
}) {
  const total = countParts(parts);
  const subtitle =
    interactionIdx == null
      ? "Select an interaction"
      : harness === "cursor"
        ? `${total.toLocaleString()} in interaction ${interactionIdx}`
        : `${total.toLocaleString()} request${total === 1 ? "" : "s"} · interaction ${interactionIdx}`;

  return (
    <div className="flex min-h-0 flex-col border-border/60 lg:border-r">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-sm font-medium">Requests</p>
        <p className="text-xs text-muted-foreground">{loading ? "Loading…" : subtitle}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading requests…
          </div>
        ) : parts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No requests in this interaction.
          </p>
        ) : (
          <PartsRenderer
            parts={parts}
            selectedTimelineId={selectedTimelineId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}
