"use client";

import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { CursorCsvExportButtons } from "@/components/cursor/cursor-csv-export-buttons";
import { CursorCsvUploadPanel } from "@/components/cursor/cursor-csv-upload-panel";
import { useCursorExportSuggestion } from "@/components/cursor/use-cursor-export-suggestion";
import { SetupStepCard } from "@/components/setup/setup-shell";
import { nextPathAfterCursorUpload } from "@/lib/onboarding/navigation";
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

  if (exportState.status === "loading" || exportState.status === "idle") {
    return (
      <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle size={18} className="animate-spin shrink-0" aria-hidden="true" />
          <span>Reading local Cursor activity to suggest export dates…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-border/60 bg-muted/20 p-6">
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

      <CursorCsvUploadPanel actionsAlign="end" onUploaded={onUploaded} />
    </div>
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
      title="Upload Cursor billing CSV"
      description="We use billing exports for spend and leverage — project paths are linked in the next step."
    >
      <CursorUploadExportCard
        onUploaded={(result) => void handleUploaded(result)}
      />
    </SetupStepCard>
  );
}
