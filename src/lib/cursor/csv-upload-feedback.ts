import { toast } from "sonner";

import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";

/** How long the upload success toast stays visible before the sync popover. */
export const UPLOAD_TOAST_DURATION_MS = 4000;

export type CsvUploadToastOutcome = "imported" | "duplicate";

/** Show upload feedback. Returns whether new rows were imported. */
export function showCsvUploadToast(
  result: ProviderUsageUploadResult,
): CsvUploadToastOutcome {
  if (result.inserted === 0) {
    toast.info(
      result.skipped > 0
        ? `No new rows — ${result.skipped.toLocaleString()} already imported`
        : "No billing rows found in file",
    );
    return "duplicate";
  }

  toast.success(
    `Imported ${result.inserted.toLocaleString()} billing rows` +
      (result.skipped > 0
        ? ` (${result.skipped.toLocaleString()} duplicates skipped)`
        : ""),
    { duration: UPLOAD_TOAST_DURATION_MS },
  );
  return "imported";
}

export function waitForUploadToast(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, UPLOAD_TOAST_DURATION_MS);
  });
}
