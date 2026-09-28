"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, LoaderCircle, RefreshCw, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { TracingExplorerSkeleton } from "@/components/layout/page-loading-skeletons";
import { useTraceSync } from "@/components/tracing/trace-sync-provider";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Surface } from "@/components/ui/surface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HarnessLogo, HarnessStack } from "@/components/layout/harness-logo";
import { useRouteSync } from "@/components/layout/route-sync";
import { toRelativeTimeAgo } from "@/lib/format";
import type { TraceProject } from "@/lib/tracing-shared";

const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";

function relativeFromSec(sec: number | null): string {
  if (sec == null) return "—";
  return toRelativeTimeAgo(new Date(sec * 1000).toISOString()) ?? "—";
}

export function TracingExplorer() {
  const { activeHarness } = useRouteSync();
  const { startTraceSync, syncing } = useTraceSync();
  const [projects, setProjects] = useState<TraceProject[] | null>(null);
  const [indexingEnabled, setIndexingEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/tracing/projects");
    if (!res.ok) throw new Error("Failed to load tracing projects");
    return (await res.json()) as {
      projects: TraceProject[];
      indexingEnabled?: boolean;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchProjects();
        if (!cancelled) {
          setProjects(json.projects);
          setIndexingEnabled(json.indexingEnabled ?? true);
        }
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
  }, [fetchProjects, refreshKey, activeHarness]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects ?? [];
    return (projects ?? []).filter(
      (p) =>
        p.projectName.toLowerCase().includes(term) ||
        p.projectPath.toLowerCase().includes(term),
    );
  }, [projects, search]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Tracing"
        title="Tracing"
        description={
          activeHarness === "cursor"
            ? "Explore Cursor composer sessions by project."
            : activeHarness === "all"
              ? "Projects with the same folder path are combined; harness icons show which logs are indexed."
              : "Explore Claude Code sessions by project."
        }
        action={
          <Button
            type="button"
            variant="outline"
            disabled={syncing || indexingEnabled === false}
            onClick={() => {
              void startTraceSync({
                onComplete: () => setRefreshKey((key) => key + 1),
              });
            }}
          >
            {syncing ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            Update trace index
          </Button>
        }
      />

      {indexingEnabled === false ? (
        <Surface className="p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Full tracing is off</p>
          <p className="mt-1">
            Session indexing only runs when you choose{" "}
            <span className="text-foreground">Full tracing</span> in Settings and
            click <span className="text-foreground">Save tracing settings</span>{" "}
            for each harness you use. After that, click{" "}
            <span className="text-foreground">Update trace index</span> to build
            or refresh the index.
          </p>
        </Surface>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading || projects == null ? (
        <TracingExplorerSkeleton />
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
            <p className="ml-auto text-sm tabular-nums text-muted-foreground">
              {visible.length.toLocaleString()} project
              {visible.length === 1 ? "" : "s"}
            </p>
          </div>

          {visible.length === 0 ? (
            <Surface className="p-10 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "No projects match your search."
                : indexingEnabled === false
                  ? "Turn on full tracing in Settings (and save) to enable the trace index."
                  : "No sessions indexed yet. Click Update trace index to parse local session logs."}
            </Surface>
          ) : (
            <Surface className="overflow-hidden">
              <Table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[4rem]" />
                  <col />
                  <col className="w-[7rem]" />
                  <col className="w-[7rem]" />
                  <col className="w-[10rem]" />
                  <col className="w-10" />
                </colgroup>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${HEAD} text-center`} aria-label="Harness">
                      <span className="sr-only">Harness</span>
                    </TableHead>
                    <TableHead className={HEAD}>Project</TableHead>
                    <TableHead className={`${HEAD} text-center`}>Sessions</TableHead>
                    <TableHead className={`${HEAD} text-center`}>Requests</TableHead>
                    <TableHead className={`${HEAD} text-center`}>Last activity</TableHead>
                    <TableHead className={HEAD}>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((project) => {
                    const pathKey =
                      project.projectPath.trim() ||
                      project.projectSlug;
                    return (
                    <TableRow key={pathKey} className="border-border/50">
                      <TableCell className="text-center">
                        {project.harnesses.length > 1 ? (
                          <HarnessStack harnesses={project.harnesses} logoClassName="size-4" />
                        ) : project.harnesses[0] ? (
                          <HarnessLogo harness={project.harnesses[0]} className="mx-auto size-4" />
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-0">
                        <Link
                          href={`/tracing/${encodeURIComponent(pathKey)}`}
                          className="group flex min-w-0 flex-col gap-0.5"
                        >
                          <span className="truncate font-medium group-hover:underline">
                            {project.projectName}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {project.projectPath}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {project.sessionCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {project.requestCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                        {relativeFromSec(project.lastRequestSec)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link
                          href={`/tracing/${encodeURIComponent(pathKey)}`}
                          aria-label={`Open ${project.projectName}`}
                          className="inline-flex text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}
