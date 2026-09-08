"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CircleCheck, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SettingsDetailDialog,
  SettingsDialogRow,
  SettingsDialogRowList,
  SettingsDialogTabPanels,
} from "@/components/settings/settings-detail-dialog";
import { SettingsStatusButton } from "@/components/settings/settings-ui";
import {
  buildBillingCoverageFromImports,
  formatBillingDayRange,
  summarizeBillingCoverageButton,
  type BillingCoveragePayload,
  type BillingExportAll,
} from "@/lib/cursor/billing-coverage-shared";

function useBillingImportCoverage(coverage: BillingCoveragePayload) {
  return useMemo(
    () => buildBillingCoverageFromImports(coverage.imports),
    [coverage.imports],
  );
}

function UploadedDataPanel({ coverage }: { coverage: BillingCoveragePayload }) {
  const { uploadedRanges } = useBillingImportCoverage(coverage);

  return (
    <div className="space-y-5">
      {uploadedRanges.length > 0 ? (
        <p className="flex items-center gap-2 text-sm leading-relaxed">
          <CircleCheck
            size={16}
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <span>
            {uploadedRanges
              .map((range) => formatBillingDayRange(range.from, range.to))
              .join(" · ")}
          </span>
        </p>
      ) : null}

      {coverage.imports.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent imports</p>
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Date range</TableHead>
                <TableHead className="w-28 text-right">Rows added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverage.imports.map((item) => (
                <TableRow
                  key={`${item.filename}:${item.importedAt}`}
                  className="border-border/60"
                >
                  <TableCell className="break-all font-mono text-xs whitespace-normal">
                    {item.filename}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {item.dateFrom && item.dateTo
                      ? formatBillingDayRange(item.dateFrom, item.dateTo)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.rowsInserted.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function MissingDatesPanel({ coverage }: { coverage: BillingCoveragePayload }) {
  const { missingRanges } = useBillingImportCoverage(coverage);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Gaps between CSV uploads — export from Cursor, then upload here. Days
        without usage inside an uploaded CSV are normal.
      </p>
      {missingRanges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Billing data covers through today.
        </p>
      ) : (
        <SettingsDialogRowList>
          {missingRanges.map((range) => (
            <MissingDateRow key={`${range.from}:${range.to}`} range={range} />
          ))}
        </SettingsDialogRowList>
      )}
    </div>
  );
}

function BillingCoverageDetails({
  coverage,
  activeTab,
  onTabChange,
}: {
  coverage: BillingCoveragePayload;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { missingRanges } = useBillingImportCoverage(coverage);

  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList variant="line" className="h-9 shrink-0 justify-start gap-1">
        <TabsTrigger value="uploaded" className="px-3">
          Uploaded data
        </TabsTrigger>
        <TabsTrigger value="missing" className="gap-1.5 px-3">
          Missing dates
          {missingRanges.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({missingRanges.length})
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <SettingsDialogTabPanels>
        <TabsContent value="uploaded" className="mt-0">
          <UploadedDataPanel coverage={coverage} />
        </TabsContent>

        <TabsContent value="missing" className="mt-0">
          <MissingDatesPanel coverage={coverage} />
        </TabsContent>
      </SettingsDialogTabPanels>
    </Tabs>
  );
}

function MissingDateRow({ range }: { range: BillingExportAll }) {
  return (
    <SettingsDialogRow
      title={formatBillingDayRange(range.from, range.to)}
      action={
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
          Export in Cursor
        </Button>
      }
    />
  );
}

export function BillingGapList({
  coverage,
}: {
  coverage: BillingCoveragePayload;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("uploaded");
  const { missingRanges } = useBillingImportCoverage(coverage);
  const summary = useMemo(
    () => summarizeBillingCoverageButton(coverage),
    [coverage],
  );

  useEffect(() => {
    if (open) {
      setActiveTab(missingRanges.length > 0 ? "missing" : "uploaded");
    }
  }, [open, missingRanges.length]);

  if (
    !coverage.costSourceAvailable ||
    !coverage.imports.some((item) => item.dateFrom && item.dateTo)
  ) {
    return null;
  }

  return (
    <>
      <SettingsStatusButton
        icon={CalendarRange}
        title="Billing coverage"
        description={summary}
        onClick={() => setOpen(true)}
      />

      <SettingsDetailDialog
        open={open}
        onOpenChange={setOpen}
        title="Billing coverage"
        description="CSV upload date spans and gaps between uploads."
      >
        <BillingCoverageDetails
          coverage={coverage}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </SettingsDetailDialog>
    </>
  );
}
