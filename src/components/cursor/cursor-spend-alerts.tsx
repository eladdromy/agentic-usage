"use client";

import Link from "next/link";
import { ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";

function AlertRow({
  message,
  action,
}: {
  message: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <TriangleAlert
          size={18}
          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <p className="text-sm leading-relaxed">{message}</p>
      </div>
      {action ? <div className="shrink-0 sm:pl-2">{action}</div> : null}
    </div>
  );
}

export function CursorSpendAlerts({
  coverage,
  syncingProjects = false,
  onSyncProjects,
}: {
  coverage: BillingCoveragePayload | null;
  syncingProjects?: boolean;
  onSyncProjects?: () => void;
}) {
  if (!coverage?.costSourceAvailable) return null;

  const pendingSync = coverage.projectSyncPending;
  const missingMonths = coverage.missingMonths;
  const unmatched = coverage.projectAttribution.unmatched;
  const vscdbAvailable = coverage.projectAttribution.vscdbAvailable;

  const showSync =
    syncingProjects || pendingSync > 0;
  const showMissing = missingMonths.length > 0;
  const showUnlinked = unmatched > 0;

  if (!showSync && !showMissing && !showUnlinked) {
    return null;
  }

  return (
    <Surface className="space-y-4 border-amber-500/25 bg-amber-500/5 p-4">
      {showSync ? (
        <AlertRow
          message={
            syncingProjects ? (
              <span className="flex items-center gap-2">
                <LoaderCircle
                  size={16}
                  className="animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
                Linking billing rows to local projects…
              </span>
            ) : (
              <>
                <span className="font-medium">Unsynced projects.</span>{" "}
                {pendingSync.toLocaleString()} billing row
                {pendingSync === 1 ? "" : "s"} still need to be linked to a
                local workspace.
              </>
            )
          }
          action={
            !syncingProjects && onSyncProjects ? (
              <Button type="button" size="sm" variant="outline" onClick={onSyncProjects}>
                Sync now
              </Button>
            ) : null
          }
        />
      ) : null}

      {showMissing ? (
        <AlertRow
          message={
            <>
              <span className="font-medium">Missing billing.</span> No usage
              uploaded for{" "}
              {missingMonths.length === 1
                ? missingMonths[0]!.label
                : `${missingMonths.length} months`}
              .
            </>
          }
          action={
            <div className="flex flex-wrap gap-2">
              {missingMonths.map((month) => (
                <Button
                  key={month.month}
                  nativeButton={false}
                  size="sm"
                  variant="outline"
                  render={
                    <a
                      href={month.exportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  {month.label}
                </Button>
              ))}
            </div>
          }
        />
      ) : null}

      {showUnlinked ? (
        <AlertRow
          message={
            <>
              <span className="font-medium">Unlinked rows.</span>{" "}
              {unmatched.toLocaleString()} billing row
              {unmatched === 1 ? "" : "s"} could not be matched to a local
              project
              {!vscdbAvailable
                ? " — check Cursor state.vscdb in Settings"
                : ""}
              . Totals still include them.
            </>
          }
          action={
            <Button
              nativeButton={false}
              size="sm"
              variant="ghost"
              render={<Link href="/settings" />}
            >
              Settings
            </Button>
          }
        />
      ) : null}
    </Surface>
  );
}
