"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

import { HarnessLogo, HarnessStack } from "@/components/layout/harness-logo";
import {
  ProjectSpendBreakdownTooltip,
  ProjectsApiEqHelp,
  ProjectsSpendHelp,
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
import type {
  ProjectBreakdownHarnessRow,
  ProjectBreakdownRow,
  ProjectSpendMonthLine,
} from "@/lib/projects-breakdown-shared";
import type { ActiveHarness } from "@/lib/profile/settings";
import { cn } from "@/lib/utils";

const PROJECT_HEAD = "max-w-0 whitespace-normal text-left";
const PROJECT_CELL = "max-w-0 align-top whitespace-normal text-left";
const NUMERIC = "w-[5.5rem] text-center tabular-nums";
const REQUESTS_COL = "w-[6.5rem] text-center tabular-nums";
const RANGE_COL = "w-[12rem] text-center whitespace-nowrap tabular-nums";
const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";
const SUB_ROW = "bg-muted/65 hover:bg-muted/75";
const WRAP_LABEL =
  "line-clamp-2 overflow-hidden break-words [overflow-wrap:anywhere] leading-snug";

function ProjectCell({
  label,
  detail,
}: {
  label: string;
  detail: string | null;
}) {
  const showDetail = detail && detail !== "—" && detail !== label;

  return (
    <span className="inline-flex max-w-full min-w-0 items-start gap-1">
      <span className={cn(WRAP_LABEL, "font-medium")}>{label}</span>
      {showDetail ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="mt-px shrink-0 text-muted-foreground"
                aria-label="Show full project path"
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
    </span>
  );
}

function SpendCell({
  title,
  spendLabel,
  spendMonths,
}: {
  title: string;
  spendLabel: string;
  spendMonths: ProjectSpendMonthLine[];
}) {
  if (spendLabel === "—" || spendMonths.length === 0) {
    return <>{spendLabel}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-2"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        {spendLabel}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        <ProjectSpendBreakdownTooltip
          title={title}
          lines={spendMonths}
        />
      </TooltipContent>
    </Tooltip>
  );
}

function DataRow({
  row,
  harnessBreakdownRow,
  showHarness,
  expandable = false,
  expanded = false,
  onToggle,
}: {
  row: ProjectBreakdownRow;
  harnessBreakdownRow?: ProjectBreakdownHarnessRow;
  showHarness: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const isSubRow = harnessBreakdownRow != null;
  const spendLabel = isSubRow ? harnessBreakdownRow.spendLabel : row.spendLabel;
  const spendMonths = isSubRow ? harnessBreakdownRow.spendMonths : row.spendMonths;
  const spendTooltipTitle = isSubRow
    ? `${row.label} · ${harnessBreakdownRow.harnessLabel}`
    : row.label;

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
        isSubRow && cn(SUB_ROW, "text-xs"),
      )}
      onClick={expandable ? onToggle : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
    >
      {showHarness ? (
        <>
          <TableCell className="w-10 px-2 text-center">
            {expandable ? (
              expanded ? (
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="text-muted-foreground"
                />
              ) : (
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className="text-muted-foreground"
                />
              )
            ) : null}
          </TableCell>
          <TableCell className="w-[3.5rem] align-middle text-center">
            <span className="inline-flex justify-center">
              {isSubRow ? (
                <HarnessLogo harness={harnessBreakdownRow.harness} className="size-4" />
              ) : (
                <HarnessStack harnesses={row.harnesses} />
              )}
            </span>
          </TableCell>
        </>
      ) : null}
      <TableCell className={PROJECT_CELL}>
        {isSubRow ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            {harnessBreakdownRow.harnessLabel}
          </span>
        ) : (
          <ProjectCell label={row.label} detail={row.detail} />
        )}
      </TableCell>
      <TableCell className={RANGE_COL}>
        {isSubRow ? harnessBreakdownRow.requestRangeLabel : row.requestRangeLabel}
      </TableCell>
      <TableCell className={REQUESTS_COL}>
        {(isSubRow ? harnessBreakdownRow.requestCount : row.requestCount).toLocaleString()}
      </TableCell>
      <TableCell className={NUMERIC}>
        <SpendCell
          title={spendTooltipTitle}
          spendLabel={spendLabel}
          spendMonths={spendMonths}
        />
      </TableCell>
      <TableCell className={NUMERIC}>
        {isSubRow ? harnessBreakdownRow.apiEqLabel : row.apiEqLabel}
      </TableCell>
    </TableRow>
  );
}

function ProjectRow({
  row,
  showHarness,
}: {
  row: ProjectBreakdownRow;
  showHarness: boolean;
}) {
  const canExpand = showHarness && row.harnessBreakdown.length > 1;
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <DataRow
        row={row}
        showHarness={showHarness}
        expandable={canExpand}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
      {canExpand && expanded
        ? row.harnessBreakdown.map((harnessRow) => (
            <DataRow
              key={`${row.rowKey}-${harnessRow.harness}`}
              row={row}
              harnessBreakdownRow={harnessRow}
              showHarness={showHarness}
            />
          ))
        : null}
    </>
  );
}

export function ProjectsBreakdownTableSkeleton() {
  return (
    <Surface className="overflow-hidden">
      <div className="space-y-3 p-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </Surface>
  );
}

export function ProjectsBreakdownTable({
  harness,
  rows,
  loading,
  filtered = false,
}: {
  harness: ActiveHarness;
  rows: ProjectBreakdownRow[];
  loading: boolean;
  filtered?: boolean;
}) {
  const showHarness = harness === "all";

  if (loading) {
    return <ProjectsBreakdownTableSkeleton />;
  }

  if (rows.length === 0) {
    return (
      <Surface className="p-10 text-center text-sm text-muted-foreground">
        {filtered
          ? "No projects match your search."
          : "No project spend found."}
      </Surface>
    );
  }

  return (
    <Surface className="overflow-hidden">
      <Table className="w-full table-fixed">
        <colgroup>
          {showHarness ? (
            <>
              <col className="w-10" />
              <col className="w-14" />
            </>
          ) : null}
          <col />
          <col className="w-[12rem]" />
          <col className="w-[6.5rem]" />
          <col className="w-[5.5rem]" />
          <col className="w-[5.5rem]" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {showHarness ? (
              <>
                <TableHead className={cn("w-10 px-2 text-center", HEAD)}>
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead
                  className={cn("w-[3.5rem] text-center", HEAD)}
                  aria-label="Harness"
                />
              </>
            ) : null}
            <TableHead className={cn(PROJECT_HEAD, HEAD)}>Project</TableHead>
            <TableHead
              className={cn(RANGE_COL, HEAD, "whitespace-normal text-center")}
            >
              Billing range
            </TableHead>
            <TableHead
              className={cn(REQUESTS_COL, HEAD, "whitespace-normal text-center")}
            >
              Billed requests
            </TableHead>
            <TableHead className={cn(NUMERIC, HEAD)}>
              <TableHeadHelp
                label="Spend"
                help={<ProjectsSpendHelp />}
                align="center"
              />
            </TableHead>
            <TableHead className={cn(NUMERIC, HEAD)}>
              <TableHeadHelp
                label="API eq."
                help={<ProjectsApiEqHelp />}
                align="center"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ProjectRow key={row.rowKey} row={row} showHarness={showHarness} />
          ))}
        </TableBody>
      </Table>
    </Surface>
  );
}
