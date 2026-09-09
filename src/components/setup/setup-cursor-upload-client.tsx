"use client";

import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CursorCsvUploadButton,
  CursorCsvUploadDropZone,
  useCursorCsvUpload,
} from "@/components/cursor/cursor-csv-upload-panel";
import { CursorCsvExportButtons } from "@/components/cursor/cursor-csv-export-buttons";
import { useCursorExportSuggestion } from "@/components/cursor/use-cursor-export-suggestion";
import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { Surface } from "@/components/ui/surface";
import { nextPathAfterCursorUpload } from "@/lib/onboarding/navigation";
import { CURSOR_SETUP_STEPS } from "@/lib/onboarding/setup-steps";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";

function noNewRowsMessage(result: ProviderUsageUploadResult): string {
  if (result.skipped > 0) {
    return `No new rows — ${result.skipped.toLocaleString()} already imported`;
  }
  return "No billing rows found in file";
}

function CursorUploadExportCard({
  onUploaded,
}: {
  onUploaded: (result: ProviderUsageUploadResult) => void;
}) {
  const exportState = useCursorExportSuggestion(true);
  const uploadControls = useCursorCsvUpload({ onUploaded });

  if (exportState.status === "loading" || exportState.status === "idle") {
    return (
      <Surface className="p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle size={18} className="animate-spin shrink-0" aria-hidden="true" />
          <span>Reading local Cursor activity to suggest export dates…</span>
        </div>
      </Surface>
    );
  }

  return (
    <>
      <Surface className="space-y-6 p-6">
        {exportState.suggestion ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Download usage or open the dashboard, then upload below.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Export <span className="font-mono text-xs">usage-events</span> from Cursor,
            then upload the file below.
          </p>
        )}

        <CursorCsvExportButtons state={exportState} />

        <CursorCsvUploadDropZone controls={uploadControls} />

        {uploadControls.error ? (
          <p className="text-sm text-destructive">{uploadControls.error}</p>
        ) : null}
      </Surface>

      <SetupActions>
        <CursorCsvUploadButton controls={uploadControls} />
      </SetupActions>
    </>
  );
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
      setupProgress={CURSOR_SETUP_STEPS.upload}
      title="Upload Cursor billing CSV"
      description="We use billing exports for spend and leverage — project paths are linked in the next step."
    >
      <CursorUploadExportCard
        onUploaded={(result) => void handleUploaded(result)}
      />
    </SetupStepCard>
  );
}
