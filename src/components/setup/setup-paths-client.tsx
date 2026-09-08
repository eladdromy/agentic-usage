"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  SetupActions,
  SetupStepCard,
} from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { setupEntryPath } from "@/lib/onboarding/navigation";

export function SetupPathsClient() {
  const router = useRouter();
  const { status, loading, refresh } = useOnboardingStatus();
  const [claudeHomeOverride, setClaudeHomeOverride] = useState("");
  const [vscdbPathOverride, setVscdbPathOverride] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  async function saveAndDetect() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claudeHomeOverride: claudeHomeOverride.trim() || null,
          vscdbPathOverride: vscdbPathOverride.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save paths");

      const next = await refresh();
      if (!next) return;

      if (next.suggestedFlow === "none") {
        toast.error("Still no harness detected. Check paths and try again.");
        return;
      }

      router.push(setupEntryPath(next));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save paths");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SetupStepCard
      title="Set harness paths"
      description="We couldn't find Claude Code logs or Cursor on the default paths. Point us to where your data lives, then re-detect."
    >
      <div className="space-y-4">
        <Field>
          <FieldLabel>Claude Code data directory</FieldLabel>
          <Input
            value={claudeHomeOverride}
            onChange={(e) => setClaudeHomeOverride(e.target.value)}
            placeholder={status.paths.claudeHome}
            autoComplete="off"
          />
        </Field>
        <Field>
          <FieldLabel>Cursor state.vscdb path</FieldLabel>
          <Input
            value={vscdbPathOverride}
            onChange={(e) => setVscdbPathOverride(e.target.value)}
            placeholder={status.paths.defaultVscdbPath}
            autoComplete="off"
          />
        </Field>
      </div>

      <SetupActions>
        <Button type="button" variant="ghost" onClick={() => router.push("/setup")}>
          Back
        </Button>
        <Button type="button" disabled={saving} onClick={() => void saveAndDetect()}>
          {saving ? "Checking…" : "Re-detect harnesses"}
        </Button>
      </SetupActions>
    </SetupStepCard>
  );
}
