"use client";

import { Info } from "lucide-react";

import { HarnessLogo } from "@/components/layout/harness-logo";
import {
  SpendLogsApiEqHelp,
  SpendLogsCostHelp,
} from "@/components/metric-help-content";
import { TableHeadHelp } from "@/components/table-head-help";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { HarnessKind } from "@/lib/profile/settings";

export type SpendRow = {
  id: number;
  rowKey?: string;
  harness?: HarnessKind;
  createdAtLabel: string;
  createdAgo: string | null;
  /** Project name */
  sourceLabel: string;
  /** Full project path tooltip */
  sourceDetail?: string | null;
  /** Session id (Claude) or composer / cloud-agent id (Cursor) */
  refLabel?: string;
  model: string;
  inputTokensLabel: string;
  cacheWriteLabel: string;
  cacheReadLabel: string;
  outputTokensLabel: string;
  totalTokensLabel: string;
  billingCostLabel: string;
  apiEqCostLabel: string;
};

const NUMERIC = "w-[5.5rem] text-right tabular-nums";
const METRIC = "text-center tabular-nums";
const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";
const STICKY_COST =
  "sticky right-[5.75rem] z-10 w-[5.75rem] bg-card/95 backdrop-blur-sm transition-colors group-hover/row:bg-muted/50";
const STICKY_API =
  "sticky right-0 z-10 w-[5.75rem] bg-card/95 backdrop-blur-sm transition-colors group-hover/row:bg-muted/50 shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.12)] dark:shadow-[-8px_0_16px_-10px_rgba(0,0,0,0.35)]";

function isPaidBillingLabel(label: string): boolean {
  return label.startsWith("$");
}

const WRAP_LABEL =
  "block line-clamp-2 overflow-hidden break-words [overflow-wrap:anywhere] leading-snug";
const WRAP_CELL = "max-w-0 align-top whitespace-normal";
const PROJECT_LABEL = cn(WRAP_LABEL, "font-medium");
const MODEL_LABEL = cn(WRAP_LABEL, "text-muted-foreground");

function SourceCell({
  label,
  detail,
}: {
  label: string;
  detail?: string | null;
}) {
  const showDetail = detail && detail !== "—" && detail !== label;

  return (
    <div className="flex min-w-0 items-start gap-1">
      <span className={cn(PROJECT_LABEL, "min-w-0 flex-1")}>{label}</span>
      {showDetail ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                aria-label="Show full path"
              />
            }
          >
            <Info size={14} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {detail}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function TimestampCell({
  label,
  ago,
}: {
  label: string;
  ago: string | null;
}) {
  return (
    <>
      <div className="whitespace-nowrap font-medium">{label}</div>
      {ago ? <div className="text-xs text-muted-foreground">{ago}</div> : null}
    </>
  );
}

function rowHarness(
  row: SpendRow,
  viewHarness: "claude" | "cursor" | "all",
): HarnessKind | null {
  if (row.harness) return row.harness;
  if (viewHarness === "claude" || viewHarness === "cursor") return viewHarness;
  return null;
}

export function RawSpendTableSkeleton() {
  return (
    <Surface className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </Surface>
  );
}

export function RawSpendTable({
  harness = "claude",
  rows,
  loading,
  filtered = false,
}: {
  harness?: "claude" | "cursor" | "all";
  rows: SpendRow[];
  loading?: boolean;
  filtered?: boolean;
}) {
  if (loading && rows.length === 0) {
    return <RawSpendTableSkeleton />;
  }

  if (!loading && rows.length === 0) {
    return (
      <Surface className="border-dashed p-12 text-center">
        <p className="text-sm font-medium">
          {filtered
            ? "No usage events match your filters"
            : "No usage events found"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {filtered
            ? "Try adjusting the project, model, or timeframe filters."
            : harness === "all"
              ? "Run Claude Code locally and/or upload a Cursor usage-events CSV in Settings."
              : harness === "cursor"
                ? "Upload a usage-events CSV in Settings or from the banner above."
                : "Run Claude Code locally, then re-index ~/.claude logs."}
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[1050px] table-fixed">
          <colgroup>
            <col className="w-10" />
            <col className="w-[11rem]" />
            <col className="w-[12.5rem]" />
            <col className="w-[5.5rem]" />
            <col className="w-[15ch]" />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col className="w-[5.75rem]" />
            <col className="w-[5.75rem]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className={cn(HEAD, "w-10 px-2")}>
                <span className="sr-only">Harness</span>
              </TableHead>
              <TableHead className={HEAD}>Timestamp</TableHead>
              <TableHead className={HEAD}>Project</TableHead>
              <TableHead className={HEAD}>Session</TableHead>
              <TableHead className={HEAD}>Model</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Input</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Cache write</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Cache read</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Output</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Total</TableHead>
              <TableHead className={cn(METRIC, STICKY_COST, HEAD)}>
                <TableHeadHelp
                  label="Spend"
                  help={<SpendLogsCostHelp />}
                  align="center"
                />
              </TableHead>
              <TableHead className={cn(METRIC, STICKY_API, HEAD)}>
                <TableHeadHelp
                  label="API eq."
                  help={<SpendLogsApiEqHelp />}
                  align="center"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const logoHarness = rowHarness(row, harness);

              return (
              <TableRow key={row.rowKey ?? String(row.id)} className="group/row border-border/50">
                <TableCell className="w-10 px-2">
                  {logoHarness ? <HarnessLogo harness={logoHarness} /> : null}
                </TableCell>
                <TableCell>
                  <TimestampCell label={row.createdAtLabel} ago={row.createdAgo} />
                </TableCell>
                <TableCell className={WRAP_CELL}>
                  {row.sourceDetail ? (
                    <SourceCell label={row.sourceLabel} detail={row.sourceDetail} />
                  ) : (
                    <span className={PROJECT_LABEL}>{row.sourceLabel}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.refLabel ?? "—"}
                </TableCell>
                <TableCell className={WRAP_CELL}>
                  <span className={MODEL_LABEL}>{row.model}</span>
                </TableCell>
                <TableCell className={NUMERIC}>{row.inputTokensLabel}</TableCell>
                <TableCell className={NUMERIC}>{row.cacheWriteLabel}</TableCell>
                <TableCell className={NUMERIC}>{row.cacheReadLabel}</TableCell>
                <TableCell className={NUMERIC}>{row.outputTokensLabel}</TableCell>
                <TableCell className={NUMERIC}>{row.totalTokensLabel}</TableCell>
                <TableCell
                  className={cn(
                    METRIC,
                    STICKY_COST,
                    isPaidBillingLabel(row.billingCostLabel)
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {row.billingCostLabel}
                </TableCell>
                <TableCell className={cn(METRIC, STICKY_API, "font-semibold text-foreground")}>
                  {row.apiEqCostLabel}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Surface>
  );
}
