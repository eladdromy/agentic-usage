"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { CursorCsvExportButtons } from "@/components/cursor/cursor-csv-export-buttons";
import { CursorCsvUploadPanel } from "@/components/cursor/cursor-csv-upload-panel";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
import { useCursorExportSuggestion } from "@/components/cursor/use-cursor-export-suggestion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";

function noNewRowsMessage(result: ProviderUsageUploadResult): string {
  if (result.skipped > 0) {
    return `No new rows — ${result.skipped.toLocaleString()} already imported`;
  }
  return "No billing rows found in file";
}

function formatUploadSummary(result: ProviderUsageUploadResult): string {
  return (
    `Imported ${result.inserted.toLocaleString()} billing rows` +
    (result.skipped > 0
      ? ` (${result.skipped.toLocaleString()} duplicates skipped)`
      : "")
  );
}

export function CursorCsvUploadDialog({
  open,
  onOpenChange,
  onUploaded,
  onSyncComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (result: ProviderUsageUploadResult) => void;
  onSyncComplete?: () => void;
}) {
  const { startProjectSync } = useProjectSync();
  const exportState = useCursorExportSuggestion(open);

  const handleUploaded = useCallback(
    (result: ProviderUsageUploadResult) => {
      onUploaded(result);

      if (result.inserted === 0) {
        toast.info(noNewRowsMessage(result));
        onOpenChange(false);
        return;
      }

      void startProjectSync({
        uploadSummary: formatUploadSummary(result),
        dateFrom: result.dateFrom,
        dateTo: result.dateTo,
        onComplete: onSyncComplete,
      });

      onOpenChange(false);
    },
    [onOpenChange, onSyncComplete, onUploaded, startProjectSync],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload usage-events CSV</DialogTitle>
          <DialogDescription>
            Download usage or open the dashboard, then upload below.
          </DialogDescription>
        </DialogHeader>

        <CursorCsvExportButtons state={exportState} />

        <CursorCsvUploadPanel actionsAlign="end" onUploaded={handleUploaded} />
      </DialogContent>
    </Dialog>
  );
}
