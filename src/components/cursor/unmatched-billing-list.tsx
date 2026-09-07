"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";

export function UnmatchedBillingList({
  coverage,
}: {
  coverage: BillingCoveragePayload;
}) {
  const [expanded, setExpanded] = useState(false);
  const attr = coverage.projectAttribution;

  if (!coverage.costSourceAvailable || attr.unmatched === 0) {
    return null;
  }

  const preview = attr.unmatchedPreview;

  return (
    <Surface className="space-y-3 border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {attr.unmatched.toLocaleString()} billing row
            {attr.unmatched === 1 ? "" : "s"} without a project
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {attr.vscdbAvailable
              ? "These CSV rows could not be matched to a local workspace via timestamp. Spend still counts toward totals."
              : "Cursor state.vscdb was not found — set VSCDB path in Settings or open Cursor on this machine, then re-upload the CSV."}
          </p>
          <p className="text-xs text-muted-foreground">
            {attr.matched.toLocaleString()} matched ·{" "}
            {attr.unmatched.toLocaleString()} unmatched of{" "}
            {attr.total.toLocaleString()} rows
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={expanded ? "Collapse unmatched list" : "Expand unmatched list"}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronUp size={16} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </Button>
      </div>

      {expanded ? (
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
          {attr.unmatched > preview.length ? (
            <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
              Showing {preview.length} of {attr.unmatched.toLocaleString()} unmatched rows.
            </p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
