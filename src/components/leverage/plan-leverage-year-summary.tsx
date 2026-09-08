import { Info } from "lucide-react";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { PlanSpendCell } from "@/components/leverage/plan-spend-cell";
import { PlanLeverageMonthlySparkline } from "@/components/leverage/plan-leverage-sparkline";
import { PlanLeverageSummaryDownload } from "@/components/leverage/plan-leverage-summary-download";
import { Button } from "@/components/ui/button";
import { MetricSurface, Surface } from "@/components/ui/surface";
import { Skeleton } from "@/components/ui/skeleton";
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
import type {
  PlanLeverageHarnessRow,
  PlanLeverageMonthRow,
  PlanLeverageYearSummary,
} from "@/lib/leverage/types";
import { cn } from "@/lib/utils";

const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";
const NUMERIC = "text-center tabular-nums";
const SUMMARY_CONTENT_WIDTH = "w-full md:w-2/3";
const SUMMARY_HERO_WIDTH = "w-full max-w-4xl";

const METRIC_HELP = {
  leverage:
    "Total API-equivalent spend for the year divided by total spend (subscription plus on-demand).",
  spend:
    "Sum of subscription plan fees plus any on-demand charges from billing CSV imports across the year.",
  apiEq:
    "Total usage valued at public API list prices — what the same tokens would cost pay-as-you-go.",
  planExposure:
    "Positive gap between API eq. and spend — the extra you would pay if suppliers stopped subsidizing usage or you switched to API-based billing. Shown as $0 when spend exceeds API eq.",
} as const;

function MetricHelpButton({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground"
            aria-label={`How ${label} is calculated`}
          />
        }
      >
        <Info size={14} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

function monthlyTrendFromRows(
  months: PlanLeverageMonthRow[],
  pick: (row: PlanLeverageMonthRow) => number,
): { month: string; value: number }[] {
  return months
    .map((row) => ({ month: row.month, value: pick(row) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function SummaryMetric({
  label,
  value,
  help,
  year,
  trend,
  trendLabel,
  trendFormatKind = "usd",
}: {
  label: string;
  value: string;
  help: string;
  year: number;
  trend: { month: string; value: number }[];
  trendLabel: string;
  trendFormatKind?: "usd" | "leverage";
}) {
  return (
    <MetricSurface className="flex min-w-0 flex-col justify-center gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <MetricHelpButton label={label} description={help} />
      </div>
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

function BasisHelpTerm({
  children,
  description,
  underlined = false,
}: {
  children: React.ReactNode;
  description: string;
  underlined?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "font-semibold tabular-nums text-foreground",
              underlined &&
                "underline decoration-border underline-offset-2 hover:decoration-foreground/70",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

function SummaryBasisLine({
  spendLabel,
  apiEqLabel,
}: {
  spendLabel: string;
  apiEqLabel: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm leading-relaxed text-muted-foreground">
      <span>Based on</span>
      <BasisHelpTerm description={METRIC_HELP.spend} underlined>
        spend of {spendLabel}
      </BasisHelpTerm>
      <span>and calculation of</span>
      <BasisHelpTerm description={METRIC_HELP.apiEq} underlined>
        API equivalent of {apiEqLabel}
      </BasisHelpTerm>
      <span>.</span>
    </p>
  );
}

function HarnessRow({ row }: { row: PlanLeverageHarnessRow }) {
  const inactive = row.inactive === true;
  const monthsLabel =
    row.monthCount == null || row.monthCount === 0 ? "—" : String(row.monthCount);

  return (
    <TableRow className={cn("border-border/50", inactive && "text-muted-foreground/70")}>
      <TableCell className="min-w-[9rem]">
        <span className="flex items-center gap-2 font-medium">
          <HarnessLogo harness={row.harness} />
          {row.harnessLabel}
        </span>
      </TableCell>
      <TableCell className={cn(NUMERIC, "min-w-[4rem]")}>{monthsLabel}</TableCell>
      <TableCell className={cn(NUMERIC, "min-w-[6rem]")}>
        {row.leverageLabel}
      </TableCell>
      <TableCell className={cn(NUMERIC, "min-w-[5rem]")}>
        {row.planExposureLabel}
      </TableCell>
      <TableCell className={cn(NUMERIC, "min-w-[8rem]")}>
        <PlanSpendCell
          planUsd={row.planUsd}
          extraBilledUsd={row.extraBilledUsd}
          showBreakdown={row.extraBilledUsd > 0}
          align="center"
        />
      </TableCell>
      <TableCell className={cn(NUMERIC, "min-w-[5rem]")}>
        {row.apiEqvUsdLabel}
      </TableCell>
    </TableRow>
  );
}

export function PlanLeverageYearSummaryCard({
  year,
  summary,
  months,
  layout = "default",
  showDownload = true,
}: {
  year: number;
  summary: PlanLeverageYearSummary;
  months: PlanLeverageMonthRow[];
  layout?: "default" | "hero";
  showDownload?: boolean;
}) {
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
      data-readme-screenshot="year-summary"
      className={cn(
        "section-stack",
        layout === "hero" ? SUMMARY_HERO_WIDTH : SUMMARY_CONTENT_WIDTH,
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Summary of {year}</h2>
          {showDownload ? (
            <PlanLeverageSummaryDownload
              year={year}
              summary={summary}
              months={months}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <SummaryMetric
              label="Plan leverage"
              value={summary.leverageLabel}
              help={METRIC_HELP.leverage}
              year={year}
              trend={leverageTrend}
              trendLabel="Plan leverage"
              trendFormatKind="leverage"
            />
            <SummaryMetric
              label="Plan exposure"
              value={summary.planExposureLabel}
              help={METRIC_HELP.planExposure}
              year={year}
              trend={exposureTrend}
              trendLabel="Plan exposure"
            />
          </div>

          <SummaryBasisLine
            spendLabel={summary.planSpendLabel}
            apiEqLabel={summary.apiEqvUsdLabel}
          />
        </div>
      </div>

      {showHarnessBreakdown ? (
        <Surface className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[620px]">
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
                  <HarnessRow key={row.harness} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

export function PlanLeverageYearSummarySkeleton() {
  return (
    <div className={cn("section-stack", SUMMARY_CONTENT_WIDTH)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
      </div>
      <Surface className="space-y-2 p-4">
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </Surface>
    </div>
  );
}
