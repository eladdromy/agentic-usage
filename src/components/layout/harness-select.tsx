"use client";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { useRouteSync } from "@/components/layout/route-sync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { ActiveHarness } from "@/lib/profile/settings";
import { useIsClient } from "@/lib/use-is-client";

const HARNESS_OPTIONS: { value: ActiveHarness; label: string }[] = [
  { value: "all", label: "All harnesses" },
  { value: "claude", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
];

function selectedLabel(value: ActiveHarness): string {
  return HARNESS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function HarnessOptionIcon({ value }: { value: ActiveHarness }) {
  if (value === "all") {
    return (
      <span className="flex shrink-0 items-center -space-x-1">
        <HarnessLogo harness="claude" className="size-4" />
        <HarnessLogo harness="cursor" className="size-4" />
      </span>
    );
  }

  return <HarnessLogo harness={value} className="size-4" />;
}

function HarnessSelectPlaceholder({ value }: { value: ActiveHarness }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-auto min-w-[9.5rem] items-center gap-2 rounded-xl border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground"
    >
      <HarnessOptionIcon value={value} />
      {selectedLabel(value)}
    </div>
  );
}

export function HarnessSelect() {
  const isClient = useIsClient();
  const { activeHarness, syncing, switchingHarness, switchHarness } =
    useRouteSync();

  if (!isClient) {
    return <HarnessSelectPlaceholder value={activeHarness} />;
  }

  const disabled = syncing || switchingHarness;

  return (
    <Select
      value={activeHarness}
      onValueChange={(value) => {
        const next = (value as ActiveHarness) ?? "claude";
        if (next === activeHarness) return;
        void switchHarness(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="Active harness"
        className="h-8 w-auto min-w-[9.5rem] rounded-xl border-border/60 bg-muted/50 px-2.5 text-xs font-medium"
      >
        <span className="flex items-center gap-2">
          <HarnessOptionIcon value={activeHarness} />
          {selectedLabel(activeHarness)}
        </span>
      </SelectTrigger>
      <SelectContent align="start">
        {HARNESS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <HarnessOptionIcon value={option.value} />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
