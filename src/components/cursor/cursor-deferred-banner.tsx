"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { useRouteSync } from "@/components/layout/route-sync";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

export function CursorDeferredBanner() {
  const router = useRouter();
  const { switchHarness } = useRouteSync();
  const [navigating, setNavigating] = useState(false);

  async function openBillingSettings() {
    setNavigating(true);
    try {
      await switchHarness("all");
      router.push("/settings?tab=billing");
    } finally {
      setNavigating(false);
    }
  }

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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={navigating}
          onClick={() => void openBillingSettings()}
        >
          {navigating ? (
            <>
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              Opening Settings…
            </>
          ) : (
            "Upload CSV in Settings"
          )}
        </Button>
      </div>
    </Surface>
  );
}
