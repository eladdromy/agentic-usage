"use client";

import { forwardRef } from "react";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { PlanSpendCell } from "@/components/plan-leverage/plan-spend-cell";
import { PlanLeverageMonthlySparkline } from "@/components/plan-leverage/plan-leverage-sparkline";
import { MetricSurface, Surface } from "@/components/ui/surface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAN_LEVERAGE_SUMMARY_EXPORT_WIDTH_PX } from "@/lib/plan-leverage/download-summary-image";
import type {
  PlanLeverageHarnessRow,
  PlanLeverageMonthRow,
  PlanLeverageYearSummary,
} from "@/lib/plan-leverage/types";
import { cn } from "@/lib/utils";

const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";
const NUMERIC = "text-center tabular-nums";

function monthlyTrendFromRows(
  months: PlanLeverageMonthRow[],
  pick: (row: PlanLeverageMonthRow) => number,
): { month: string; value: number }[] {
  return months
    .map((row) => ({ month: row.month, value: pick(row) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function ExportMetric({
  label,
  value,
  year,
  trend,
  trendLabel,
  trendFormatKind = "usd",
}: {
  label: string;
  value: string;
  year: number;
  trend: { month: string; value: number }[];
  trendLabel: string;
  trendFormatKind?: "usd" | "leverage";
}) {
  return (
    <MetricSurface className="flex min-w-0 flex-col justify-center gap-3">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-4xl font-semibold tabular-nums tracking-tight">{value}</p>
      <PlanLeverageMonthlySparkline
        year={year}
        data={trend}
        valueLabel={trendLabel}
        formatKind={trendFormatKind}
        className="mt-auto h-10"
      />
    </MetricSurface>
  );
}

function ExportBasisLine({
  spendLabel,
  apiEqLabel,
}: {
  spendLabel: string;
  apiEqLabel: string;
}) {
  const termClass =
    "font-semibold tabular-nums text-foreground underline decoration-border underline-offset-2";

  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      Based on{" "}
      <span className={termClass}>spend of {spendLabel}</span> and calculation of{" "}
      <span className={termClass}>API equivalent of {apiEqLabel}</span>.
    </p>
  );
}

function ExportHarnessRow({ row }: { row: PlanLeverageHarnessRow }) {
  const inactive = row.inactive === true;
  const monthsLabel =
    row.monthCount == null || row.monthCount === 0 ? "—" : String(row.monthCount);

  return (
    <TableRow className={cn("border-border/50", inactive && "text-muted-foreground/70")}>
      <TableCell>
        <span className="flex items-center gap-2 font-medium">
          <HarnessLogo harness={row.harness} />
          {row.harnessLabel}
        </span>
      </TableCell>
      <TableCell className={NUMERIC}>{monthsLabel}</TableCell>
      <TableCell className={NUMERIC}>{row.leverageLabel}</TableCell>
      <TableCell className={NUMERIC}>{row.planExposureLabel}</TableCell>
      <TableCell className={NUMERIC}>
        <PlanSpendCell
          planUsd={row.planUsd}
          extraBilledUsd={row.extraBilledUsd}
          showBreakdown={row.extraBilledUsd > 0}
          align="center"
        />
      </TableCell>
      <TableCell className={NUMERIC}>{row.apiEqvUsdLabel}</TableCell>
    </TableRow>
  );
}

export const PlanLeverageSummaryExportCard = forwardRef<
  HTMLDivElement,
  {
    year: number;
    summary: PlanLeverageYearSummary;
    months: PlanLeverageMonthRow[];
  }
>(function PlanLeverageSummaryExportCard({ year, summary, months }, ref) {
  const showHarnessBreakdown = summary.harnessBreakdown.length > 0;
  const leverageTrend = monthlyTrendFromRows(
    months,
    (row) => row.leverage ?? 0,
  );
  const exposureTrend = monthlyTrendFromRows(
    months,
    (row) => row.planExposureUsd,
  );

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 -z-50 overflow-hidden bg-background text-foreground opacity-0"
      style={{ width: PLAN_LEVERAGE_SUMMARY_EXPORT_WIDTH_PX }}
      aria-hidden="true"
    >
      <div className="flex flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Summary of {year}
        </h1>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <ExportMetric
              label="Plan leverage"
              value={summary.leverageLabel}
              year={year}
              trend={leverageTrend}
              trendLabel="Plan leverage"
              trendFormatKind="leverage"
            />
            <ExportMetric
              label="Plan exposure"
              value={summary.planExposureLabel}
              year={year}
              trend={exposureTrend}
              trendLabel="Plan exposure"
            />
          </div>

          <ExportBasisLine
            spendLabel={summary.planSpendLabel}
            apiEqLabel={summary.apiEqvUsdLabel}
          />
        </div>

        {showHarnessBreakdown ? (
          <Surface className="overflow-hidden p-0">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className={HEAD}>Harness</TableHead>
                  <TableHead className={cn(NUMERIC, HEAD)}>Months</TableHead>
                  <TableHead className={cn(NUMERIC, HEAD)}>Plan leverage</TableHead>
                  <TableHead className={cn(NUMERIC, HEAD)}>Plan exposure</TableHead>
                  <TableHead className={cn(NUMERIC, HEAD)}>Spend</TableHead>
                  <TableHead className={cn(NUMERIC, HEAD)}>API eq.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.harnessBreakdown.map((row) => (
                  <ExportHarnessRow key={row.harness} row={row} />
                ))}
              </TableBody>
            </Table>
          </Surface>
        ) : null}

        <p className="text-right text-xs text-muted-foreground">
          Created with Plan-Leverage by Elad Dromy
        </p>
      </div>
    </div>
  );
});
