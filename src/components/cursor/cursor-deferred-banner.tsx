"use client";

import Link from "next/link";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { Surface } from "@/components/ui/surface";

export function CursorDeferredBanner() {
  return (
    <Surface className="space-y-4 border-sky-500/30 bg-sky-500/5 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1 text-sm leading-relaxed">
          <div className="flex items-center gap-2.5">
            <HarnessLogo harness="cursor" className="size-5 shrink-0" />
            <p className="font-medium">Cursor detected on this machine</p>
          </div>
          <p className="text-muted-foreground">
            Upload your Cursor billing CSV to include Cursor spend in Plan Leverage and
            merged harness views.
          </p>
        </div>
        <Link
          href="/settings?tab=billing"
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          Upload CSV in Settings
        </Link>
      </div>
    </Surface>
  );
}
