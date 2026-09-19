"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  SettingsActions,
  SettingsHelpText,
  SettingsSubsection,
  settingsSelectTriggerClass,
} from "@/components/settings/settings-ui";
import { TraceSyncProgressPanel } from "@/components/tracing/trace-sync-progress-panel";
import {
  runTraceSyncChunks,
  type TraceSyncSnapshot,
} from "@/components/tracing/trace-sync-provider";
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
  const [snapshot, setSnapshot] = useState<TraceSyncSnapshot | null>(null);

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

      if (mode === "full_tracing") {
        try {
          await runTraceSyncChunks(setSnapshot);
        } catch {
          toast.error("Trace indexing failed. You can retry from the Tracing page.");
        }
      }
      toast.success("Tracing settings saved.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const indexing =
    snapshot?.phase === "planning" || snapshot?.phase === "indexing";

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
          Turning on full tracing builds a one-time index of local session logs; later
          visits only re-parse changed sessions. Turning it off keeps existing data (use
          reset:trace to wipe).
        </SettingsHelpText>
      </Field>

      {snapshot && (indexing || snapshot.phase === "done") ? (
        indexing ? (
          <TraceSyncProgressPanel snapshot={snapshot} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Trace index up to date
            {snapshot.projects.length > 0
              ? ` — ${snapshot.projects
                  .reduce((sum, p) => sum + p.sessionsIndexed, 0)
                  .toLocaleString()} sessions indexed.`
              : "."}
          </p>
        )
      ) : null}

      <SettingsActions>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save tracing settings"}
        </Button>
      </SettingsActions>
    </SettingsSubsection>
  );
}
