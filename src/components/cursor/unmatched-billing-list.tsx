"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import {
  SettingsDetailDialog,
  SettingsDialogScrollBody,
  SettingsDialogSection,
  SettingsDialogStatStrip,
} from "@/components/settings/settings-detail-dialog";
import { SettingsStatusButton } from "@/components/settings/settings-ui";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";

function UnmatchedBillingDetails({
  coverage,
}: {
  coverage: BillingCoveragePayload;
}) {
  const attr = coverage.projectAttribution;
  const preview = attr.unmatchedPreview;

  return (
    <div className="space-y-5">
      <SettingsDialogStatStrip>
        {attr.matched.toLocaleString()} matched ·{" "}
        {(attr.unmatched ?? 0).toLocaleString()} unmatched of{" "}
        {attr.total.toLocaleString()} rows
      </SettingsDialogStatStrip>

      <SettingsDialogSection
        title="Unmatched rows"
        description="Preview of billing rows that could not be linked to a local project."
        divider={false}
      >
        <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-medium tracking-wide uppercase">
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {row.dateIso}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.kind || "—"}</td>
                <td className="max-w-[10rem] truncate px-3 py-2 text-muted-foreground">
                  {row.model || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.cost || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.reasonLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(attr.unmatched ?? 0) > preview.length ? (
          <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
            Showing {preview.length} of {(attr.unmatched ?? 0).toLocaleString()} unmatched rows.
          </p>
        ) : null}
        </div>
      </SettingsDialogSection>
    </div>
  );
}

export function UnmatchedBillingList({
  coverage,
}: {
  coverage: BillingCoveragePayload;
}) {
  const [open, setOpen] = useState(false);
  const attr = coverage.projectAttribution;

  const unmatched = attr.unmatched ?? 0;

  const summary = useMemo(() => {
    return unmatched === 1
      ? "1 row without project"
      : `${unmatched.toLocaleString()} rows without project`;
  }, [unmatched]);

  if (!coverage.costSourceAvailable || unmatched === 0) {
    return null;
  }

  return (
    <>
      <SettingsStatusButton
        icon={AlertTriangle}
        title="Unmatched rows"
        description={summary}
        className="border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
        onClick={() => setOpen(true)}
      />

      <SettingsDetailDialog
        open={open}
        onOpenChange={setOpen}
        title={`${unmatched.toLocaleString()} billing row${unmatched === 1 ? "" : "s"} without a project`}
        description={
          attr.vscdbAvailable
            ? "These CSV rows could not be matched to a local workspace via timestamp. Spend still counts toward totals."
            : "Cursor state.vscdb was not found — set VSCDB path in Settings or open Cursor on this machine, then re-upload the CSV."
        }
      >
        <SettingsDialogScrollBody>
          <UnmatchedBillingDetails coverage={coverage} />
        </SettingsDialogScrollBody>
      </SettingsDetailDialog>
    </>
  );
}
