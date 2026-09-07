"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import {
  formatBillingMonthLabel,
  type BillingCoveragePayload,
  type BillingMonthRange,
} from "@/lib/cursor/billing-coverage-shared";

function MonthRow({
  range,
  actionLabel,
}: {
  range: BillingMonthRange;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">{range.label}</p>
      <Button
        nativeButton={false}
        variant="outline"
        size="sm"
        className="shrink-0"
        render={
          <a href={range.exportUrl} target="_blank" rel="noopener noreferrer" />
        }
      >
        <ExternalLink size={16} aria-hidden="true" />
        {actionLabel}
      </Button>
    </div>
  );
}

export function BillingGapList({
  coverage,
}: {
  coverage: BillingCoveragePayload;
}) {
  if (!coverage.costSourceAvailable || coverage.uploadedMonths.length === 0) {
    return null;
  }

  const uploadedSummary =
    coverage.uploadedMonths.length === 1
      ? coverage.uploadedMonths[0]!.label
      : `${coverage.uploadedMonths.length} months`;

  return (
    <Surface className="space-y-4 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Uploaded billing data</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Coverage is by calendar month — days without usage are normal.
          Export missing months from Cursor, then upload the CSV here.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Uploaded months
        </p>
        <ul className="space-y-1">
          {coverage.uploadedMonths.map((month) => (
            <li key={month.month} className="text-sm">
              {month.label}
            </li>
          ))}
        </ul>
        {coverage.dataRange ? (
          <p className="text-xs text-muted-foreground">
            Row dates span {coverage.dataRange.from} → {coverage.dataRange.to}
            {coverage.uploadedMonths.length > 1 ? ` (${uploadedSummary})` : null}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Missing months
        </p>
        {coverage.missingMonths.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every month from your first upload through{" "}
            {formatBillingMonthLabel(new Date().toISOString().slice(0, 7))} has
            billing data.
          </p>
        ) : (
          <ul className="space-y-2">
            {coverage.missingMonths.map((month) => (
              <li key={month.month}>
                <MonthRow range={month} actionLabel="Export in Cursor" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Surface>
  );
}
