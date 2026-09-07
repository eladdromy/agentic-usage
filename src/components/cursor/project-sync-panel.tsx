"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  CircleX,
  LoaderCircle,
  Minus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import {
  fetchProjectSyncMonths,
  idleProjectSyncMonths,
  runProjectSyncByMonth,
} from "@/lib/cursor/project-sync-client";
import type { ProjectSyncMonthState } from "@/lib/cursor/project-sync-types";

function StatusBadge({ month }: { month: ProjectSyncMonthState }) {
  switch (month.status) {
    case "in_progress":
      return (
        <Badge variant="secondary" className="gap-1">
          <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
          In progress
        </Badge>
      );
    case "done":
      return (
        <Badge variant="secondary" className="gap-1">
          <CircleCheck size={12} aria-hidden="true" />
          Done
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="outline" className="gap-1">
          <Minus size={12} aria-hidden="true" />
          Up to date
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <CircleX size={12} aria-hidden="true" />
          Failed
        </Badge>
      );
    case "pending":
      return <Badge variant="outline">Waiting</Badge>;
    default:
      return month.pendingRows > 0 ? (
        <Badge variant="outline">Needs sync</Badge>
      ) : (
        <Badge variant="outline" className="gap-1">
          <CircleCheck size={12} aria-hidden="true" />
          Done
        </Badge>
      );
  }
}

function monthDetail(month: ProjectSyncMonthState): string | null {
  if (month.status === "in_progress") {
    return "Matching billing rows to local projects…";
  }
  if (month.status === "pending") {
    return "Waiting for earlier months…";
  }
  if (month.status === "error") {
    return month.error ?? "Sync failed";
  }

  const parts: string[] = [];
  if (month.matchedRows > 0) {
    parts.push(`${month.matchedRows.toLocaleString()} matched`);
  }
  if (month.unmatchedRows > 0) {
    parts.push(`${month.unmatchedRows.toLocaleString()} unmatched`);
  }
  if (month.pendingRows > 0) {
    parts.push(`${month.pendingRows.toLocaleString()} need matching`);
  }

  if (parts.length > 0) return parts.join(" · ");
  if (month.status === "skipped") return "Already synced";
  return `${month.totalRows.toLocaleString()} rows synced`;
}

export function ProjectSyncPanel({
  syncKey = 0,
  retryUnmatched = false,
  onComplete,
  onSyncingChange,
}: {
  /** Increment to start a month-by-month project sync run. */
  syncKey?: number;
  /** Re-attempt rows that previously failed to match. */
  retryUnmatched?: boolean;
  onComplete?: () => void;
  onSyncingChange?: (syncing: boolean) => void;
}) {
  const [months, setMonths] = useState<ProjectSyncMonthState[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [vscdbAvailable, setVscdbAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const payload = await fetchProjectSyncMonths();
    setVscdbAvailable(payload.vscdbAvailable);
    setMonths(idleProjectSyncMonths(payload));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch(() => {
        if (!cancelled) setMonths([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (syncKey === 0) return;

    let cancelled = false;

    async function run() {
      setSyncing(true);
      onSyncingChange?.(true);
      try {
        const payload = await fetchProjectSyncMonths();
        if (cancelled) return;

        setVscdbAvailable(payload.vscdbAvailable);
        setMonths(
          payload.months.map((info) => ({
            ...info,
            status:
              info.pendingRows === 0 &&
              !(retryUnmatched && info.unmatchedRows > 0)
                ? ("skipped" as const)
                : ("pending" as const),
          })),
        );

        await runProjectSyncByMonth({
          retryUnmatched,
          onMonthChange: (month, state) => {
            if (cancelled) return;
            setMonths((prev) =>
              prev.map((row) => (row.month === month ? state : row)),
            );
          },
        });

        if (!cancelled) {
          await refresh();
          onComplete?.();
        }
      } finally {
        if (!cancelled) {
          setSyncing(false);
          onSyncingChange?.(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [syncKey, retryUnmatched, onComplete, onSyncingChange, refresh]);

  if (loading && months.length === 0) {
    return (
      <Surface className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Loading project sync status…
      </Surface>
    );
  }

  if (months.length === 0) return null;

  return (
    <Surface className="space-y-3 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Project sync</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Matches billing rows to local Cursor composers and workspace paths,
          month by month. Unmatched rows couldn&apos;t be linked to a local
          project — not the same as still syncing.
        </p>
        {!vscdbAvailable ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Cursor state.vscdb not found — project matching will fail until it is
            available.
          </p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {months.map((month) => {
          const detail = monthDetail(month);
          return (
            <li
              key={month.month}
              className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{month.label}</p>
                {detail ? (
                  <p className="text-xs text-muted-foreground">{detail}</p>
                ) : null}
              </div>
              <StatusBadge month={month} />
            </li>
          );
        })}
      </ul>

      {syncing ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Syncing projects…
        </p>
      ) : null}
    </Surface>
  );
}
