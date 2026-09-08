"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { SortFilter } from "@/components/filters";
import { ProjectsBreakdownPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { useRouteSync } from "@/components/layout/route-sync";
import { PageHeader } from "@/components/page-header";
import { ProjectsBreakdownTable } from "@/components/projects-breakdown/projects-breakdown-table";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  filterProjectBreakdownRows,
  sortProjectBreakdownRows,
  type ProjectBreakdownRow,
  type ProjectBreakdownSort,
} from "@/lib/projects-breakdown-shared";
import type { ActiveHarness } from "@/lib/profile/settings";

type ProjectsBreakdownResponse = {
  harness: ActiveHarness;
  rows: ProjectBreakdownRow[];
  totalApiEqUsd: number;
};

const SORT_OPTIONS = [
  { value: "recent_activity", label: "Recent activity" },
  { value: "most_plan_spend", label: "Most spend (subscription)" },
  { value: "most_api_eq", label: "Most spend (API eq.)" },
] as const;

function resolveSort(value: string | null): ProjectBreakdownSort {
  if (value === "most_plan_spend") return "most_plan_spend";
  if (value === "most_api_eq" || value === "most_spend") return "most_api_eq";
  return "recent_activity";
}

export function ProjectsBreakdownPageClient() {
  const searchParams = useSearchParams();
  const sort = resolveSort(searchParams.get("sort"));
  const { syncVersion, syncing, activeHarness } = useRouteSync();
  const [data, setData] = useState<ProjectsBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/projects-breakdown");
    if (!res.ok) throw new Error("Failed to load projects breakdown");
    return (await res.json()) as ProjectsBreakdownResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (syncing) return;

      setLoading(true);
      setError(null);
      try {
        const json = await fetchData();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [syncVersion, syncing, fetchData]);

  const waitingForIndex =
    syncing && (activeHarness === "claude" || activeHarness === "all") && data == null;
  const isInitialLoad = data == null && (loading || waitingForIndex);

  const visibleRows = useMemo(() => {
    const filtered = filterProjectBreakdownRows(data?.rows ?? [], search);
    return sortProjectBreakdownRows(filtered, sort);
  }, [data?.rows, search, sort]);

  const description =
    activeHarness === "all" ? (
      <>
        All-time spend and API-equivalent cost by project.
        <br />
        Same workspace in multiple harnesses is combined; expand a row to see
        per-harness breakdown.
      </>
    ) : activeHarness === "cursor"
        ? "All-time API-equivalent spend summed by project from your uploaded Cursor usage-events CSV. Spend is your subscription cost allocated by each project's share of monthly API eq."
        : "All-time API-equivalent spend summed by project from Claude Code logs. Spend is your subscription cost allocated by each project's share of monthly API eq.";

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Usage" title="Projects breakdown" description={description} />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {isInitialLoad ? (
        <ProjectsBreakdownPageContentSkeleton />
      ) : (
        <div className="section-stack">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <InputGroup className="h-9 w-full max-w-sm rounded-xl border-border/60 bg-card/80">
              <InputGroupAddon>
                <Search size={16} aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects…"
                aria-label="Search projects"
              />
            </InputGroup>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sort by</span>
              <SortFilter
                options={[...SORT_OPTIONS]}
                triggerClassName="w-[13rem]"
              />
            </div>
            <p className="ml-auto text-sm tabular-nums text-muted-foreground">
              {visibleRows.length.toLocaleString()} project
              {visibleRows.length === 1 ? "" : "s"}
              {search.trim() && data
                ? ` of ${data.rows.length.toLocaleString()}`
                : null}
            </p>
          </div>

          <ProjectsBreakdownTable
            rows={visibleRows}
            loading={loading}
            filtered={Boolean(search.trim())}
          />
        </div>
      )}
    </div>
  );
}
