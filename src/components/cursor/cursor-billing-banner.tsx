"use client";

import { useState } from "react";
import { TriangleAlert, Upload } from "lucide-react";

import { CursorCsvUploadDialog } from "@/components/cursor/csv-upload-dialog";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";

export function CursorBillingBanner({
  coverage,
  onUploaded,
}: {
  coverage: BillingCoveragePayload | null;
  onUploaded?: () => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!coverage?.needsCsv && !notice) {
    if (!coverage || coverage.costSourceAvailable) return null;
  }

  const showBanner = coverage?.needsCsv || !coverage?.costSourceAvailable;

  const handleUploaded = (result: ProviderUsageUploadResult) => {
    setNotice(
      `Imported ${result.inserted.toLocaleString()} rows` +
        (result.skipped > 0
          ? ` (${result.skipped.toLocaleString()} duplicates skipped)`
          : "") +
        " — syncing projects by month…",
    );
    onUploaded?.();
  };

  if (!showBanner && !notice) return null;

  return (
    <>
      <Surface className="space-y-4 border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <TriangleAlert
              size={20}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Upload usage-events CSV to see costs and plan leverage
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Cursor billing and API-equivalent cost come from your account{" "}
                <span className="font-mono">usage-events</span> CSV export.
                Export from the Cursor usage dashboard, then upload here.
              </p>
              {notice ? (
                <p className="text-sm text-muted-foreground">{notice}</p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={16} aria-hidden="true" />
            Upload CSV
          </Button>
        </div>
      </Surface>

      <CursorCsvUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={handleUploaded}
      />
    </>
  );
}
