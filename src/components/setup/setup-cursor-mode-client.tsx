"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, Receipt, Waypoints } from "lucide-react";

import { SetupActions, SetupStepCard } from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { Button } from "@/components/ui/button";
import { nextPathAfterCursorMode } from "@/lib/onboarding/navigation";
import { CURSOR_SETUP_STEPS } from "@/lib/onboarding/setup-steps";
import type { TraceMode } from "@/lib/profile/settings";
import { cn } from "@/lib/utils";

const OPTIONS: {
  value: TraceMode;
  icon: typeof Receipt;
  title: string;
  description: string;
}[] = [
  {
    value: "spend_only",
    icon: Receipt,
    title: "Spend breakdown only",
    description:
      "Import usage-events CSV for plan leverage, projects, and spend logs.",
  },
  {
    value: "full_tracing",
    icon: Waypoints,
    title: "Spend + Full Tracing",
    description:
      "Also index composer sessions from local state.vscdb — interactions, requests, and breakdowns.",
  },
];

export function SetupCursorModeClient() {
  const router = useRouter();
  const { status, loading, refresh } = useOnboardingStatus();
  const [selected, setSelected] = useState<TraceMode>("spend_only");
  const [saving, setSaving] = useState(false);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Preparing Cursor setup…
      </div>
    );
  }

  async function handleContinue() {
    setSaving(true);
    const currentTraceMode = status?.settings.traceMode ?? {};
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceMode: { ...currentTraceMode, cursor: selected },
      }),
    });
    await refresh();
    router.push(nextPathAfterCursorMode());
  }

  return (
    <SetupStepCard
      setupProgress={CURSOR_SETUP_STEPS.mode}
      title="Choose what to index for Cursor"
      description="Pick how much Cursor activity to index. You can change this later in Settings."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelected(option.value)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-2xl border p-5 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border/60 bg-card/80 hover:bg-muted/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-background/80">
                  <option.icon size={20} aria-hidden="true" className="text-muted-foreground" />
                </div>
                {isSelected ? (
                  <CircleCheck size={18} className="text-primary" aria-hidden="true" />
                ) : null}
              </div>
              <p className="mt-3 text-sm font-medium">{option.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      <SetupActions>
        <Button type="button" onClick={() => void handleContinue()} disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}
