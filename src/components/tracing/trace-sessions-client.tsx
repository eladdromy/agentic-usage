"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { TracingSessionsSkeleton } from "@/components/layout/page-loading-skeletons";
import { useTraceSync } from "@/components/tracing/trace-sync-provider";
import { TraceSessionsTable } from "@/components/tracing/trace-sessions-table";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { TraceSession } from "@/lib/tracing-shared";

type SessionsResponse = {
  rows: TraceSession[];
  total: number;
  offset: number;
  limit: number;
  projectPath: string;
  projectName: string;
};

const PAGE_SIZE = 50;
const PAGE_MORE = 20;

const SORT_OPTIONS = [
  { value: "last_request", label: "Last request" },
  { value: "created", label: "Created" },
  { value: "most_requests", label: "Most requests" },
] as const;

export function TraceSessionsClient({ projectKey }: { projectKey: string }) {
  const { snapshot, version } = useTraceSync();
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 250);
  const [sort, setSort] = useState("last_request");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const buildUrl = useCallback(
    (offset: number, limit: number) => {
      const params = new URLSearchParams();
      params.set("projectPath", projectKey);
      params.set("offset", String(offset));
      params.set("limit", String(limit));
      params.set("sort", sort);
      if (search.trim()) params.set("search", search.trim());
      return `/api/tracing/sessions?${params.toString()}`;
    },
    [projectKey, search, sort],
  );

  useEffect(() => {
    if (snapshot.phase !== "done" && snapshot.phase !== "error") return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(0, PAGE_SIZE));
        if (!res.ok) throw new Error("Failed to load sessions");
        const json = (await res.json()) as SessionsResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [buildUrl, version, snapshot.phase]);

  const hasMore = data ? data.rows.length < data.total : false;

  const loadMore = useCallback(async () => {
    if (!data || loading || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(data.rows.length, PAGE_MORE));
      if (!res.ok) throw new Error("Failed to load more sessions");
      const json = (await res.json()) as SessionsResponse;
      setData((prev) =>
        prev ? { ...json, rows: [...prev.rows, ...json.rows] } : json,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [buildUrl, data, hasMore, loading]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const indexing = snapshot.phase === "planning" || snapshot.phase === "indexing";
  const isInitialLoad = !indexing && (loading || data == null);

  const description = useMemo(() => {
    if (!data) return undefined;
    return data.projectPath;
  }, [data]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={
          <Link
            href="/tracing"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            All projects
          </Link>
        }
        title={data?.projectName ?? "Sessions"}
        description={description}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {isInitialLoad ? (
        <TracingSessionsSkeleton />
      ) : (
        <div className="section-stack">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <InputGroup className="h-9 w-full max-w-sm rounded-xl border-border/60 bg-card/80">
              <InputGroupAddon>
                <Search size={16} aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search sessions…"
                aria-label="Search sessions"
              />
            </InputGroup>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sort by</span>
              <Select value={sort} onValueChange={(value) => setSort(value ?? "last_request")}>
                <SelectTrigger className="w-[12rem] rounded-xl border-border/60 bg-card/80">
                  {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Last request"}
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="ml-auto text-sm tabular-nums text-muted-foreground">
              {data ? `${data.total.toLocaleString()} session${data.total === 1 ? "" : "s"}` : "—"}
            </p>
          </div>

          <TraceSessionsTable
            projectKey={projectKey}
            rows={data?.rows ?? []}
            filtered={Boolean(search.trim())}
          />

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
