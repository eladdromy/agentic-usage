"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  CircleX,
  LoaderCircle,
  Minus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  SettingsDetailDialog,
  SettingsDialogAlert,
  SettingsDialogRow,
  SettingsDialogRowList,
  SettingsDialogScrollBody,
  SettingsDialogSection,
  SettingsDialogStatStrip,
} from "@/components/settings/settings-detail-dialog";
import { SettingsStatusButton } from "@/components/settings/settings-ui";
import {
  fetchProjectSyncMonths,
  idleProjectSyncMonths,
} from "@/lib/cursor/project-sync-client";
import { summarizeProjectSyncButton } from "@/lib/cursor/project-sync-summary";
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

function projectSyncStatStrip(months: ProjectSyncMonthState[]): string {
  const monthsBehind = months.filter((month) => month.pendingRows > 0).length;
  const failed = months.filter((month) => month.status === "error").length;
  const totalRows = months.reduce((sum, month) => sum + month.totalRows, 0);

  const parts = [
    months.length === 1 ? "1 billing month" : `${months.length} billing months`,
    `${totalRows.toLocaleString()} rows`,
  ];

  if (failed > 0) {
    parts.push(failed === 1 ? "1 failed" : `${failed} failed`);
  } else if (monthsBehind > 0) {
    parts.push(
      monthsBehind === 1 ? "1 behind billing" : `${monthsBehind} behind billing`,
    );
  } else {
    parts.push("synced with billing");
  }

  return parts.join(" · ");
}

function ProjectSyncDetails({
  months,
  syncing,
  vscdbAvailable,
}: {
  months: ProjectSyncMonthState[];
  syncing: boolean;
  vscdbAvailable: boolean;
}) {
  return (
    <>
      <SettingsDialogStatStrip>{projectSyncStatStrip(months)}</SettingsDialogStatStrip>

      {!vscdbAvailable ? (
        <SettingsDialogAlert>
          Cursor state.vscdb not found — project matching will fail until it is
          available.
        </SettingsDialogAlert>
      ) : null}

      <SettingsDialogSection
        title="By month"
        description="Each billing month is matched to local Cursor composers and workspace paths. Unmatched rows are tracked separately."
      >
        <SettingsDialogRowList>
          {months.map((month) => {
            const detail = monthDetail(month);
            return (
              <SettingsDialogRow
                key={month.month}
                title={month.label}
                detail={detail}
                action={<StatusBadge month={month} />}
              />
            );
          })}
        </SettingsDialogRowList>

        {syncing ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Syncing projects…
          </p>
        ) : null}
      </SettingsDialogSection>
    </>
  );
}

export function ProjectSyncPanel({
  refreshKey = 0,
  syncing = false,
}: {
  /** Increment to reload month status from the server. */
  refreshKey?: number;
  syncing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState<ProjectSyncMonthState[]>([]);
  const [loading, setLoading] = useState(true);
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
  }, [refresh, refreshKey]);

  const summary = useMemo(
    () => summarizeProjectSyncButton(months, { syncing, loading }),
    [months, syncing, loading],
  );

  if (!loading && months.length === 0) return null;

  return (
    <>
      <SettingsStatusButton
        icon={CircleCheck}
        title="Project sync"
        description={summary}
        loading={loading || syncing}
        disabled={loading && months.length === 0}
        onClick={() => setOpen(true)}
      />

      <SettingsDetailDialog
        open={open}
        onOpenChange={setOpen}
        title="Project sync"
        description="Matches uploaded billing rows to local Cursor workspace paths, month by month."
      >
        {loading && months.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading project sync status…
          </div>
        ) : (
          <SettingsDialogScrollBody>
            <ProjectSyncDetails
              months={months}
              syncing={syncing}
              vscdbAvailable={vscdbAvailable}
            />
          </SettingsDialogScrollBody>
        )}
      </SettingsDetailDialog>
    </>
  );
}
