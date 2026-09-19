"use client";

import Link from "next/link";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCostUsd, shortSessionId, toRelativeTimeAgo } from "@/lib/format";
import type { TraceSession } from "@/lib/tracing-shared";

const HEAD = "bg-muted/40 text-xs font-medium tracking-wide uppercase";

function relativeFromSec(sec: number | null): string {
  if (sec == null) return "—";
  return toRelativeTimeAgo(new Date(sec * 1000).toISOString()) ?? "—";
}

function startedFromSec(sec: number | null): string {
  if (sec == null) return "—";
  return new Date(sec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TraceSessionsTableSkeleton() {
  return (
    <Surface className="overflow-hidden">
      <div className="space-y-3 p-6">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </Surface>
  );
}

export function TraceSessionsTable({
  projectKey,
  rows,
  filtered = false,
}: {
  projectKey: string;
  rows: TraceSession[];
  filtered?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Surface className="p-10 text-center text-sm text-muted-foreground">
        {filtered ? "No sessions match your search." : "No sessions in this project."}
      </Surface>
    );
  }

  const encodedProject = encodeURIComponent(projectKey);

  return (
    <Surface className="overflow-hidden">
      <Table className="w-full table-fixed">
        <colgroup>
          <col className="w-[3rem]" />
          <col />
          <col className="w-[7rem]" />
          <col className="w-[7rem]" />
          <col className="w-[6rem]" />
          <col className="w-[8rem]" />
          <col className="w-[8rem]" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD} aria-label="Harness">
              <span className="sr-only">Harness</span>
            </TableHead>
            <TableHead className={HEAD}>Session</TableHead>
            <TableHead className={`${HEAD} text-center`}>Interactions</TableHead>
            <TableHead className={`${HEAD} text-center`}>Requests</TableHead>
            <TableHead className={`${HEAD} text-center`}>Cost</TableHead>
            <TableHead className={`${HEAD} text-center`}>Started</TableHead>
            <TableHead className={`${HEAD} text-center`}>Last req</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((session) => (
            <TableRow key={`${session.harness}-${session.sessionId}`} className="border-border/50">
              <TableCell className="text-center">
                <HarnessLogo harness={session.harness} className="mx-auto size-4" />
              </TableCell>
              <TableCell className="max-w-0">
                <Link
                  href={`/tracing/${encodedProject}/${encodeURIComponent(session.sessionId)}?harness=${session.harness}`}
                  className="group flex min-w-0 flex-col gap-0.5"
                >
                  <span className="truncate font-medium group-hover:underline">
                    {session.sessionName?.trim() || "Untitled session"}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {shortSessionId(session.sessionId)}
                    {session.modelLabel ? ` · ${session.modelLabel}` : ""}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {session.interactionCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {session.requestCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-center tabular-nums text-muted-foreground">
                {formatCostUsd(session.costUsd)}
              </TableCell>
              <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                {startedFromSec(session.startedSec)}
              </TableCell>
              <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                {relativeFromSec(session.lastRequestSec)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Surface>
  );
}
