"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { PlanLeveragePageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { useRouteSync } from "@/components/layout/route-sync";
import {
  PlanLeverageTable,
} from "@/components/leverage/plan-leverage-table";
import {
  PlanLeverageYearSummaryCard,
} from "@/components/leverage/plan-leverage-year-summary";
import { PageHeader } from "@/components/page-header";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  isReadmeYearSummaryScreenshot,
  readmeScreenshotYear,
} from "@/lib/demo/readme-screenshot";
import type { PlanLeverageYearPayload } from "@/lib/leverage/types";
import { useIsClient } from "@/lib/use-is-client";

export function PlanLeveragePageClient() {
  const searchParams = useSearchParams();
  const isClient = useIsClient();
  const screenshotMode =
    isClient && isReadmeYearSummaryScreenshot(searchParams);
  const { syncVersion, syncing, activeHarness } = useRouteSync();
  const [year, setYear] = useState(() =>
    readmeScreenshotYear(searchParams, new Date().getUTCFullYear()),
  );
  const [data, setData] = useState<PlanLeverageYearPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (syncing) return;

      setLoading(true);
      setError(null);
      try {
        const leverageRes = await fetch(
          `/api/leverage?year=${encodeURIComponent(String(year))}`,
        );
        if (!leverageRes.ok) throw new Error("Failed to load plan leverage");
        const json = (await leverageRes.json()) as PlanLeverageYearPayload;
        if (!cancelled) {
          setData(json);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [year, syncVersion, syncing]);

  const waitingForIndex =
    isClient &&
    syncing &&
    (activeHarness === "claude" || activeHarness === "all") &&
    data == null;
  const isInitialLoad = data == null && (loading || waitingForIndex);
  const showRows = !isInitialLoad && data != null;
  const harness = data?.activeHarness ?? activeHarness;

  if (screenshotMode) {
    if (isInitialLoad) {
      return <PlanLeveragePageContentSkeleton />;
    }

    if (!showRows) return null;

    return (
      <PlanLeverageYearSummaryCard
        year={data.selectedYear}
        summary={data.yearSummary}
        months={data.months}
        layout="hero"
        showDownload={false}
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Analytics"
        title="Plan Leverage"
        description={
          harness === "all" ? (
            <>
              How much usage value you get for what you pay — leverage from subsidized
              subscription usage.
              <br />
              Expand a month to see per-harness breakdown.
            </>
          ) : (
            "How much usage value you get for what you pay — leverage from subsidized subscription usage."
          )
        }
      />

      {!isInitialLoad && !data?.plan ? (
        <Surface className="border-dashed p-5 text-sm leading-relaxed">
          Plan not detected.{" "}
          <Link
            href="/settings"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Set your plan in Settings
          </Link>
          .
        </Surface>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {data?.showYearTabs ? (
        <Tabs
          value={String(year)}
          onValueChange={(value) => setYear(Number.parseInt(value, 10))}
        >
          <TabsList variant="line" className="h-10 gap-1">
            {data.years.map((y) => (
              <TabsTrigger key={y} value={String(y)} className="px-4">
                {y}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {isInitialLoad ? (
        <PlanLeveragePageContentSkeleton />
      ) : showRows ? (
        <div className="section-stack">
          <PlanLeverageYearSummaryCard
            year={data.selectedYear}
            summary={data.yearSummary}
            months={data.months}
          />
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Monthly Breakdown</h2>
            <PlanLeverageTable
              months={data.months}
              showHarnessBreakdown={harness === "all"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
