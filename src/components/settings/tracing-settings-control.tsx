"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  SettingsActions,
  SettingsHelpText,
  SettingsSubsection,
  settingsSelectTriggerClass,
} from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { HarnessKind, TraceMode, TraceModeByHarness } from "@/lib/profile/settings";

const MODE_OPTIONS: { value: TraceMode; label: string }[] = [
  { value: "spend_only", label: "Spend only" },
  { value: "full_tracing", label: "Full tracing" },
];

export function TracingSettingsControl({
  harness,
  currentTraceMode,
  onSaved,
}: {
  harness: HarnessKind;
  currentTraceMode: TraceModeByHarness;
  onSaved?: () => void;
}) {
  const [mode, setMode] = useState<TraceMode>(
    currentTraceMode[harness] ?? "spend_only",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traceMode: { ...currentTraceMode, [harness]: mode },
        }),
      });
      if (!res.ok) throw new Error("Save failed");

      toast.success(
        mode === "full_tracing"
          ? "Tracing settings saved. Open Tracing and click Update trace index to build the index."
          : "Tracing settings saved.",
      );
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSubsection
      title="Tracing"
      description="Choose whether to index full session traces (interactions, requests, and per-request breakdowns) in addition to spend."
    >
      <Field className="max-w-prose shrink-0">
        <FieldLabel>Tracing mode</FieldLabel>
        <div className="w-56 max-w-full shrink-0">
          <Select
            value={mode}
            onValueChange={(value) => setMode((value as TraceMode) ?? "spend_only")}
          >
            <SelectTrigger className={settingsSelectTriggerClass}>
              {MODE_OPTIONS.find((o) => o.value === mode)?.label}
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SettingsHelpText>
          Saving full tracing does not build the index. Open Tracing and click
          Update trace index when you want to parse local session logs. Turning
          it off keeps existing data (use reset:trace to wipe).
        </SettingsHelpText>
      </Field>

      <SettingsActions>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save tracing settings"}
        </Button>
      </SettingsActions>
    </SettingsSubsection>
  );
}
