"use client";

import { Download, ExternalLink, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBillingDayRange } from "@/lib/cursor/billing-coverage-shared";
import type { CursorExportSuggestionState } from "@/components/cursor/use-cursor-export-suggestion";

export function CursorCsvExportButtons({
  state,
  showDateRange = true,
}: {
  state: CursorExportSuggestionState;
  showDateRange?: boolean;
}) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin shrink-0" aria-hidden="true" />
        <span>Suggesting export dates…</span>
      </div>
    );
  }

  const { suggestion } = state;
  if (!suggestion) return null;

  return (
    <div className="space-y-2">
      {showDateRange ? (
        <p className="text-sm text-muted-foreground">
          Suggested range: {formatBillingDayRange(suggestion.from, suggestion.to)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          variant="default"
          size="sm"
          render={
            <a
              href={suggestion.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <Download size={16} aria-hidden="true" />
          Download usage
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={
            <a
              href={suggestion.exportUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLink size={16} aria-hidden="true" />
          Open dashboard
        </Button>
      </div>
    </div>
  );
}
