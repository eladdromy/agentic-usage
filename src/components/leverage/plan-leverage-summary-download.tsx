"use client";

import { useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

import { PlanLeverageSummaryExportCard } from "@/components/leverage/plan-leverage-summary-export-card";
import { Button } from "@/components/ui/button";
import { downloadPlanLeverageSummaryImage } from "@/lib/leverage/download-summary-image";
import type {
  PlanLeverageMonthRow,
  PlanLeverageYearSummary,
} from "@/lib/leverage/types";

export function PlanLeverageSummaryDownload({
  year,
  summary,
  months,
}: {
  year: number;
  summary: PlanLeverageYearSummary;
  months: PlanLeverageMonthRow[];
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    const node = exportRef.current;
    if (!node || downloading) return;

    setDownloading(true);
    try {
      await downloadPlanLeverageSummaryImage(node, year);
    } catch (error) {
      console.error("Failed to download summary image", error);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        aria-label="Download summary"
        onClick={() => void handleDownload()}
        disabled={downloading}
      >
        {downloading ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )}
        Download
      </Button>

      <PlanLeverageSummaryExportCard
        ref={exportRef}
        year={year}
        summary={summary}
        months={months}
      />
    </>
  );
}
