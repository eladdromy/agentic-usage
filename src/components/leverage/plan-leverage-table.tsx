"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { PlanSpendCell } from "@/components/leverage/plan-spend-cell";
import { PlanLeverageSparkline } from "@/components/leverage/plan-leverage-sparkline";
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
import type {
  PlanLeverageHarnessRow,
  PlanLeverageMonthRow,
} from "@/lib/leverage/types";
import { cn } from "@/lib/utils";

const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";
const NUMERIC = "text-center tabular-nums";
const SUB_ROW = "bg-muted/65 hover:bg-muted/75";

function leverageTrendClass(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 5) return "text-emerald-600 dark:text-emerald-400";
  if (pct <= -5) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function LeverageCell({
  leverageLabel,
  leveragePriorPct,
  incompleteBilling,
  compact = false,
}: {
  leverageLabel: string;
  leveragePriorPct: number | null;
  incompleteBilling?: boolean;
  compact?: boolean;
}) {
  const trendClass = leverageTrendClass(leveragePriorPct);
  const secondaryClass = compact
    ? "text-[11px] leading-tight"
    : "text-xs leading-tight";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn(incompleteBilling && "text-muted-foreground")}>
        {leverageLabel}
      </span>
      {incompleteBilling ? (
        <span className={cn(secondaryClass, "text-amber-600 dark:text-amber-400")}>
          Partial billing
        </span>
      ) : leveragePriorPct != null ? (
        <span className={cn(secondaryClass, "font-medium", trendClass)}>
          {leveragePriorPct >= 0 ? "+" : ""}
          {leveragePriorPct.toFixed(1)}% vs prior
        </span>
      ) : null}
    </div>
  );
}

function DataRow({
  monthLabel,
  planUsd,
  extraBilledUsd,
  planSpendShowBreakdown,
  apiEqvUsdLabel,
  leverageLabel,
  leveragePriorPct,
  planExposureLabel,
  dailySparkline,
  month,
  incompleteBilling,
  harness,
  inactive = false,
  expandable = false,
  expanded = false,
  onToggle,
}: {
  monthLabel: string;
  planUsd: number;
  extraBilledUsd: number;
  planSpendShowBreakdown: boolean;
  apiEqvUsdLabel: string;
  leverageLabel: string;
  leveragePriorPct: number | null;
  planExposureLabel: string;
  dailySparkline: { date: string; apiEqvUsd: number }[];
  month: string;
  incompleteBilling?: boolean;
  harness?: PlanLeverageHarnessRow["harness"];
  inactive?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const isSubRow = harness != null;
  const emptyCell = inactive;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!expandable || !onToggle) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <TableRow
      className={cn(
        "group/row border-border/50",
        expandable && "cursor-pointer",
        inactive && "text-muted-foreground/70",
        isSubRow && cn(SUB_ROW, "text-xs"),
      )}
      onClick={expandable ? onToggle : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
    >
      <TableCell className="w-10 px-2">
        {expandable ? (
          expanded ? (
            <ChevronDown size={16} aria-hidden="true" className="text-muted-foreground" />
          ) : (
            <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
          )
        ) : null}
      </TableCell>
      <TableCell className={cn("min-w-[9rem]", !isSubRow && "font-medium")}>
        {isSubRow ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <HarnessLogo harness={harness} className="size-4" />
            {monthLabel}
          </span>
        ) : (
          monthLabel
        )}
      </TableCell>
      <TableCell
        className={cn(NUMERIC, "min-w-[6rem]", emptyCell && "text-muted-foreground")}
      >
        {inactive ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <LeverageCell
            leverageLabel={leverageLabel}
            leveragePriorPct={leveragePriorPct}
            incompleteBilling={incompleteBilling}
            compact={isSubRow}
          />
        )}
      </TableCell>
      <TableCell
        className={cn(NUMERIC, "min-w-[5rem]", emptyCell && "text-muted-foreground")}
      >
        {planExposureLabel}
      </TableCell>
      <TableCell
        className={cn(NUMERIC, "min-w-[8rem]", emptyCell && "text-muted-foreground")}
      >
        {emptyCell ? (
          <span>—</span>
        ) : (
          <PlanSpendCell
            planUsd={planUsd}
            extraBilledUsd={extraBilledUsd}
            showBreakdown={planSpendShowBreakdown}
            compact={isSubRow}
            align="center"
          />
        )}
      </TableCell>
      <TableCell
        className={cn(NUMERIC, "min-w-[5rem]", emptyCell && "text-muted-foreground")}
      >
        {apiEqvUsdLabel}
      </TableCell>
      <TableCell className="min-w-[8rem] max-w-[10rem] p-2">
        {inactive ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <PlanLeverageSparkline month={month} data={dailySparkline} />
        )}
      </TableCell>
    </TableRow>
  );
}

function MonthRow({
  row,
  showHarnessBreakdown,
}: {
  row: PlanLeverageMonthRow;
  showHarnessBreakdown: boolean;
}) {
  const canExpand = showHarnessBreakdown && row.harnessBreakdown.length > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <DataRow
        monthLabel={row.monthLabel}
        planUsd={row.planUsd}
        extraBilledUsd={row.extraBilledUsd}
        planSpendShowBreakdown={!showHarnessBreakdown && row.extraBilledUsd > 0}
        apiEqvUsdLabel={row.apiEqvUsdLabel}
        leverageLabel={row.leverageLabel}
        leveragePriorPct={row.leveragePriorPct}
        planExposureLabel={row.planExposureLabel}
        dailySparkline={row.dailySparkline}
        month={row.month}
        incompleteBilling={row.incompleteBilling}
        expandable={canExpand}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {canExpand && expanded
        ? row.harnessBreakdown.map((harnessRow) => (
            <DataRow
              key={harnessRow.harness}
              monthLabel={harnessRow.harnessLabel}
              planUsd={harnessRow.planUsd}
              extraBilledUsd={harnessRow.extraBilledUsd}
              planSpendShowBreakdown={harnessRow.extraBilledUsd > 0}
              apiEqvUsdLabel={harnessRow.apiEqvUsdLabel}
              leverageLabel={harnessRow.leverageLabel}
              leveragePriorPct={harnessRow.leveragePriorPct}
              planExposureLabel={harnessRow.planExposureLabel}
              dailySparkline={harnessRow.dailySparkline}
              month={row.month}
              incompleteBilling={harnessRow.incompleteBilling}
              harness={harnessRow.harness}
              inactive={harnessRow.inactive}
            />
          ))
        : null}
    </>
  );
}

export function PlanLeverageTable({
  months,
  loading,
  showHarnessBreakdown = false,
}: {
  months: PlanLeverageMonthRow[];
  loading?: boolean;
  showHarnessBreakdown?: boolean;
}) {
  if (loading && months.length === 0) {
    return (
      <Surface className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </Surface>
    );
  }

  if (!loading && months.length === 0) {
    return (
      <Surface className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No spend recorded for this year.
      </Surface>
    );
  }

  return (
    <Surface className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className={cn(HEAD, "w-10 px-2")}>
                <span className="sr-only">Expand</span>
              </TableHead>
              <TableHead className={HEAD}>Month</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Plan leverage</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Plan exposure</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>Spend</TableHead>
              <TableHead className={cn(NUMERIC, HEAD)}>API eq.</TableHead>
              <TableHead className={HEAD}>Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((row) => (
              <MonthRow
                key={row.month}
                row={row}
                showHarnessBreakdown={showHarnessBreakdown}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </Surface>
  );
}

export function PlanLeverageTableSkeleton() {
  return (
    <Surface className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </Surface>
  );
}
