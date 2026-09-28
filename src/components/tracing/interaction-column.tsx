"use client";

import { formatCostUsd } from "@/lib/format";
import {
  formatDurationSec,
  type TraceInteractionSummary,
} from "@/lib/tracing-shared";
import { cn } from "@/lib/utils";

function timeLabel(sec: number | null): string {
  if (sec == null) return "";
  return new Date(sec * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInteractionMode(mode: string | null | undefined): string | null {
  if (!mode) return null;
  const labels: Record<string, string> = {
    agent: "Agent",
    ask: "Ask",
    plan: "Plan",
    default: "Default",
  };
  return labels[mode] ?? mode;
}

function InteractionCard({
  interaction,
  harness,
  selected,
  onSelect,
}: {
  interaction: TraceInteractionSummary;
  harness: "claude" | "cursor";
  selected: boolean;
  onSelect: () => void;
}) {
  const toolCount = interaction.toolSummary.reduce((sum, t) => sum + t.count, 0);
  const types: string[] = [];
  if (toolCount > 0) types.push(`${toolCount} tool${toolCount === 1 ? "" : "s"}`);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 bg-background/60 hover:bg-muted/60",
      )}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Interaction {interaction.idx}</span>
        <span className="text-xs text-muted-foreground">
          {timeLabel(interaction.startedSec)}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Duration:{" "}
          <span className="text-foreground">
            {formatDurationSec(interaction.startedSec, interaction.endedSec)}
          </span>
        </span>
        <span>
          Requests: <span className="text-foreground">{interaction.requestCount}</span>
        </span>
        <span className="truncate">
          Model:{" "}
          <span className="text-foreground">{interaction.model ?? "—"}</span>
        </span>
        <span>
          Cost:{" "}
          <span className="text-foreground">{formatCostUsd(interaction.costUsd)}</span>
        </span>
        {types.length > 0 ? (
          <span className="col-span-2 truncate">
            Types: <span className="text-foreground">{types.join(", ")}</span>
          </span>
        ) : null}
        {harness === "cursor" && interaction.interactionMode ? (
          <span className="col-span-2 truncate">
            Interaction type:{" "}
            <span className="text-foreground">
              {formatInteractionMode(interaction.interactionMode)}
            </span>
          </span>
        ) : null}
        {harness === "cursor" && interaction.reverted ? (
          <span className="col-span-2 text-xs font-medium text-destructive">Reverted</span>
        ) : null}
      </div>
    </button>
  );
}

export function InteractionColumn({
  harness,
  interactions,
  selectedIdx,
  onSelect,
}: {
  harness: "claude" | "cursor";
  interactions: TraceInteractionSummary[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col border-border/60 lg:border-r">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-sm font-medium">Interactions</p>
        <p className="text-xs text-muted-foreground">
          {interactions.length.toLocaleString()} turn
          {interactions.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {interactions.map((interaction) => (
          <InteractionCard
            key={interaction.idx}
            interaction={interaction}
            harness={harness}
            selected={interaction.idx === selectedIdx}
            onSelect={() => onSelect(interaction.idx)}
          />
        ))}
      </div>
    </div>
  );
}
