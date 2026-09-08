"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { CursorSpendNotices } from "@/components/cursor/cursor-spend-notices";
import {
  ModelFilter,
  ProjectLabelFilter,
  SortFilter,
  TimeframeFilter,
  hasActiveSpendFilters,
} from "@/components/filters";
import { RawSpendPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { useRouteSync } from "@/components/layout/route-sync";
import { PageHeader } from "@/components/page-header";
import { RawSpendTable, type SpendRow } from "@/components/raw-spend/raw-spend-table";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";

type RawSpendResponse = {
  harness: "claude" | "cursor" | "all";
  rows: SpendRow[];
  page: number;
  pageSize: number;
  total: number;
  lastSyncAt?: string | null;
  lastImportAt?: string | null;
  needsCsv?: boolean;
  billingCoverage?: BillingCoveragePayload;
};

export function RawSpendPageClient() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const { syncVersion, syncing, activeHarness } = useRouteSync();
  const [data, setData] = useState<RawSpendResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [claudeHome, setClaudeHome] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { claudeHome?: string } | null) => {
        if (!cancelled && json?.claudeHome) {
          setClaudeHome(json.claudeHome);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const params = new URLSearchParams(window.location.search);
      params.set("page", String(pageNum));

      const res = await fetch(`/api/raw-spend?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load spend logs");
      const json = (await res.json()) as RawSpendResponse;

      setData((prev) => {
        if (append && prev && prev.harness === json.harness) {
          return {
            ...json,
            rows: [...prev.rows, ...json.rows],
          };
        }
        return json;
      });
      setPage(pageNum);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (syncing) return;

      setLoading(true);
      setError(null);
      setPage(1);
      try {
        await fetchPage(1, false);
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
  }, [fetchPage, queryKey, syncVersion, syncing, refreshKey]);

  const hasMore = data ? data.rows.length < data.total : false;

  const loadMore = useCallback(async () => {
    if (!data || loading || !hasMore || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [data, fetchPage, hasMore, loading, page]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const harness = data?.harness ?? activeHarness;
  const waitingForIndex =
    syncing && (activeHarness === "claude" || activeHarness === "all") && data == null;
  const isInitialLoad = data == null && (loading || waitingForIndex);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Audit"
        title="Spend Logs"
        description={
          harness === "all"
            ? "Combined spend from Claude Code logs and Cursor usage-events CSV, with API-equivalent cost from token pricing."
            : harness === "cursor"
              ? "Billed usage-events rows from your uploaded CSV with API-equivalent cost from token pricing."
              : "Per-request token breakdown. Spend shows Included or on-demand charges from logs; API eq. is calculated."
        }
      />

      {(harness === "cursor" || harness === "all") && !isInitialLoad ? (
        <CursorSpendNotices
          coverage={data?.billingCoverage ?? null}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}

      {isInitialLoad ? (
        <RawSpendPageContentSkeleton />
      ) : (
        <div className="section-stack">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Project</span>
                <ProjectLabelFilter refreshKey={refreshKey} />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Model</span>
                <ModelFilter refreshKey={refreshKey} />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Timeframe</span>
                <TimeframeFilter />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort by</span>
                <SortFilter
                  options={[
                    { value: "last_request", label: "Last Request" },
                    { value: "highest_spend", label: "Highest Spend" },
                  ]}
                />
              </div>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              {data ? `${data.total.toLocaleString()} requests` : "—"}
            </p>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <RawSpendTable
              harness={harness}
              rows={data?.rows ?? []}
              loading={loading}
              filtered={hasActiveSpendFilters(searchParams)}
              claudeHome={claudeHome}
            />
          )}

          {hasMore || loadingMore ? (
            <div
              ref={loadMoreRef}
              className="flex justify-center py-2"
              aria-live="polite"
              aria-busy={loadingMore}
            >
              {loadingMore ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                  Loading more…
                </div>
              ) : (
                <span className="sr-only">Load more when visible</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
