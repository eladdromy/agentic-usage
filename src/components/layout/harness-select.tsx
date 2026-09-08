"use client";

import { useEffect, useState } from "react";

import { HarnessLogo } from "@/components/layout/harness-logo";
import { useRouteSync } from "@/components/layout/route-sync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { ActiveHarness } from "@/lib/profile/settings";
import type { HarnessAvailability } from "@/lib/onboarding/status";
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

function HarnessBadge({ value }: { value: ActiveHarness }) {
  return (
    <div
      aria-label="Active harness"
      className="flex h-8 w-auto min-w-[9.5rem] items-center gap-2 rounded-xl border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground"
    >
      <HarnessOptionIcon value={value} />
      {selectedLabel(value)}
    </div>
  );
}

function availableOptions(availability: HarnessAvailability): ActiveHarness[] {
  const { claude, cursor } = availability;
  if (claude && cursor) return ["all", "claude", "cursor"];
  if (claude) return ["claude"];
  if (cursor) return ["cursor"];
  return ["claude"];
}

function displayHarness(
  activeHarness: ActiveHarness,
  availability: HarnessAvailability,
): ActiveHarness {
  const options = availableOptions(availability);
  if (options.length <= 1) return options[0] ?? activeHarness;
  if (options.includes(activeHarness)) return activeHarness;
  if (options.includes("all")) return "all";
  return options[0]!;
}

function initialAvailability(activeHarness: ActiveHarness): HarnessAvailability {
  return {
    claude: true,
    cursor: activeHarness === "all" || activeHarness === "cursor",
  };
}

export function HarnessSelect() {
  const isClient = useIsClient();
  const { activeHarness, syncing, switchingHarness, switchHarness } =
    useRouteSync();
  const [availability, setAvailability] = useState<HarnessAvailability>(() =>
    initialAvailability(activeHarness),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const json = (await res.json()) as {
          harnessAvailability?: HarnessAvailability;
          detectedHarnesses?: { claude: boolean; cursor: boolean };
        };
        if (cancelled) return;

        const detected = json.detectedHarnesses;
        const fromApi = json.harnessAvailability;
        if (fromApi || detected) {
          setAvailability({
            claude: fromApi?.claude ?? detected?.claude ?? true,
            cursor: fromApi?.cursor ?? detected?.cursor ?? false,
          });
        }
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeHarness, syncing]);

  if (!isClient) {
    return <HarnessBadge value={activeHarness} />;
  }

  const options = availableOptions(availability);
  const shownHarness = displayHarness(activeHarness, availability);

  if (!loaded) {
    return <HarnessBadge value={activeHarness} />;
  }

  if (options.length <= 1) {
    return <HarnessBadge value={shownHarness} />;
  }

  const disabled = syncing || switchingHarness;

  return (
    <Select
      value={shownHarness}
      onValueChange={(value) => {
        const next = (value as ActiveHarness) ?? "claude";
        if (next === shownHarness) return;
        void switchHarness(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="Active harness"
        className="h-8 w-auto min-w-[9.5rem] rounded-xl border-border/60 bg-muted/50 px-2.5 text-xs font-medium"
      >
        <span className="flex items-center gap-2">
          <HarnessOptionIcon value={shownHarness} />
          {selectedLabel(shownHarness)}
        </span>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            <HarnessOptionIcon value={option} />
            {selectedLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
