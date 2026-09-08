"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { CursorCsvUploadPanel } from "@/components/cursor/cursor-csv-upload-panel";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
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

  useEffect(() => {
    if (!open) return;
  }, [open]);

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
            Export from your Cursor account billing dashboard. Downloads are
            often named <span className="font-mono">usage-events</span> and may
            not include a <span className="font-mono">.csv</span> extension.
          </DialogDescription>
        </DialogHeader>

        <CursorCsvUploadPanel actionsAlign="end" onUploaded={handleUploaded} />
      </DialogContent>
    </Dialog>
  );
}
