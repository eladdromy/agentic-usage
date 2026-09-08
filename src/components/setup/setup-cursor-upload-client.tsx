"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CursorCsvUploadPanel } from "@/components/cursor/cursor-csv-upload-panel";
import { SetupStepCard } from "@/components/setup/setup-shell";
import { nextPathAfterCursorUpload } from "@/lib/onboarding/navigation";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";

function noNewRowsMessage(result: ProviderUsageUploadResult): string {
  if (result.skipped > 0) {
    return `No new rows — ${result.skipped.toLocaleString()} already imported`;
  }
  return "No billing rows found in file";
}

export function SetupCursorUploadClient() {
  const router = useRouter();

  async function handleUploaded(result: ProviderUsageUploadResult) {
    if (result.inserted === 0) {
      toast.info(noNewRowsMessage(result));
      return;
    }

    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeHarness: "cursor" }),
    });

    router.push(nextPathAfterCursorUpload());
  }

  return (
    <SetupStepCard
      title="Upload Cursor billing CSV"
      description="Export usage-events from your Cursor billing dashboard. We use it for spend and leverage — project paths are linked in the next step."
    >
      <CursorCsvUploadPanel
        actionsAlign="end"
        onUploaded={(result) => void handleUploaded(result)}
      />
    </SetupStepCard>
  );
}
