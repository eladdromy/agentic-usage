"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { HarnessSettingsCard } from "@/components/settings/harness-settings-card";
import { SectionHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUTO_PLAN_TIER_ID,
  CUSTOM_PLAN_TIER_ID,
  findPlanTierPreset,
  formatPlanTierOptionLabel,
  type PlanTierPreset,
} from "@/lib/profile/plan-tiers";
import type {
  HarnessKind,
  HarnessPlanOverrides,
  MonthlyPlanOverride,
  PlanOverridesByHarness,
} from "@/lib/profile/settings";

type PlanMonthsResponse = {
  harness: HarnessKind;
  years: number[];
  year: number;
  months: string[];
  detectedPlan: { label: string; monthlyUsd: number } | null;
  overrides: HarnessPlanOverrides;
  resolvedByMonth: Record<
    string,
    { label: string; monthlyUsd: number; source: string } | null
  >;
  tiers: (PlanTierPreset & { optionLabel: string })[];
};

type MonthDraft = {
  tierId: string;
  label: string;
  monthlyUsd: string;
};

type HarnessDraft = {
  year: number;
  years: number[];
  months: string[];
  detectedPlan: { label: string; monthlyUsd: number } | null;
  tiers: PlanTierPreset[];
  rows: Record<string, MonthDraft>;
};

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatBaseUsd(value: string): string {
  const parsed = Number.parseFloat(value);
  if (!value.trim() || !Number.isFinite(parsed)) return "—";
  return `$${parsed}/mo`;
}

function draftFromOverride(
  override: MonthlyPlanOverride | undefined,
  resolved: PlanMonthsResponse["resolvedByMonth"][string],
): MonthDraft {
  if (override) {
    return {
      tierId: override.tierId,
      label: override.label,
      monthlyUsd: String(override.monthlyUsd),
    };
  }
  if (resolved) {
    return {
      tierId: AUTO_PLAN_TIER_ID,
      label: resolved.label,
      monthlyUsd: String(resolved.monthlyUsd),
    };
  }
  return {
    tierId: AUTO_PLAN_TIER_ID,
    label: "",
    monthlyUsd: "",
  };
}

function buildHarnessDraft(data: PlanMonthsResponse): HarnessDraft {
  const rows: Record<string, MonthDraft> = {};
  for (const month of data.months) {
    rows[month] = draftFromOverride(
      data.overrides[month],
      data.resolvedByMonth[month],
    );
  }
  return {
    year: data.year,
    years: data.years,
    months: data.months,
    detectedPlan: data.detectedPlan,
    tiers: data.tiers,
    rows,
  };
}

function tierTriggerLabel(
  tierId: string,
  draft: MonthDraft,
  tiers: PlanTierPreset[],
  detectedPlan: HarnessDraft["detectedPlan"],
): string {
  if (tierId === AUTO_PLAN_TIER_ID) {
    return detectedPlan
      ? `Auto (${detectedPlan.label} · $${detectedPlan.monthlyUsd}/mo)`
      : "Auto-detected";
  }
  if (tierId === CUSTOM_PLAN_TIER_ID) {
    return draft.label.trim()
      ? `Custom · ${draft.label} ($${draft.monthlyUsd || "?"}/mo)`
      : "Custom";
  }
  const preset = tiers.find((tier) => tier.id === tierId);
  return preset ? formatPlanTierOptionLabel(preset) : tierId;
}

function overridesFromDraft(
  harness: HarnessKind,
  draft: HarnessDraft,
): HarnessPlanOverrides {
  const out: HarnessPlanOverrides = {};
  for (const month of draft.months) {
    const row = draft.rows[month];
    if (!row || row.tierId === AUTO_PLAN_TIER_ID) continue;

    if (row.tierId === CUSTOM_PLAN_TIER_ID) {
      const parsed = Number.parseFloat(row.monthlyUsd.replace(/[^0-9.]/g, ""));
      const label = row.label.trim();
      if (!label || !Number.isFinite(parsed)) continue;
      out[month] = {
        tierId: CUSTOM_PLAN_TIER_ID,
        label,
        monthlyUsd: parsed,
      };
      continue;
    }

    const preset = findPlanTierPreset(harness, row.tierId);
    if (!preset) continue;
    out[month] = {
      tierId: preset.id,
      label: preset.label,
      monthlyUsd: preset.monthlyUsd,
    };
  }
  return out;
}

/** Merge year draft into stored overrides without dropping other years. */
function mergeHarnessPlanOverrides(
  existing: HarnessPlanOverrides | undefined,
  year: number,
  yearOverrides: HarnessPlanOverrides,
): HarnessPlanOverrides {
  const yearPrefix = `${year}-`;
  const preserved = Object.fromEntries(
    Object.entries(existing ?? {}).filter(
      ([month]) => !month.startsWith(yearPrefix),
    ),
  );
  return { ...preserved, ...yearOverrides };
}

function HarnessPlanSection({
  harness,
  harnessLabel,
}: {
  harness: HarnessKind;
  harnessLabel: string;
}) {
  const [draft, setDraft] = useState<HarnessDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadHarness = useCallback(
    async (year?: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ harness });
        if (year != null) params.set("year", String(year));
        const res = await fetch(`/api/settings/plan-months?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load plan months");
        const json = (await res.json()) as PlanMonthsResponse;
        setDraft(buildHarnessDraft(json));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load plans");
      } finally {
        setLoading(false);
      }
    },
    [harness],
  );

  useEffect(() => {
    void loadHarness();
  }, [loadHarness]);

  function updateRow(month: string, patch: Partial<MonthDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const existing = current.rows[month] ?? {
        tierId: AUTO_PLAN_TIER_ID,
        label: "",
        monthlyUsd: "",
      };
      return {
        ...current,
        rows: {
          ...current.rows,
          [month]: { ...existing, ...patch },
        },
      };
    });
  }

  function handleTierChange(month: string, tierId: string) {
    if (!draft) return;
    if (tierId === AUTO_PLAN_TIER_ID) {
      const resolved = draft.detectedPlan;
      updateRow(month, {
        tierId,
        label: resolved?.label ?? "",
        monthlyUsd: resolved != null ? String(resolved.monthlyUsd) : "",
      });
      return;
    }
    if (tierId === CUSTOM_PLAN_TIER_ID) {
      updateRow(month, {
        tierId,
        label: "",
        monthlyUsd: "",
      });
      return;
    }
    const preset = draft.tiers.find((tier) => tier.id === tierId);
    if (!preset) return;
    updateRow(month, {
      tierId,
      label: preset.label,
      monthlyUsd: String(preset.monthlyUsd),
    });
  }

  async function saveHarness() {
    if (!draft) return;
    setSaving(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const settings = (await settingsRes.json()) as {
        planOverrides?: PlanOverridesByHarness;
      };
      const existingHarnessOverrides = settings.planOverrides?.[harness];
      const yearOverrides = overridesFromDraft(harness, draft);
      const mergedHarnessOverrides = mergeHarnessPlanOverrides(
        existingHarnessOverrides,
        draft.year,
        yearOverrides,
      );
      const nextOverrides: PlanOverridesByHarness = {
        ...(settings.planOverrides ?? {}),
        [harness]: mergedHarnessOverrides,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planOverrides: nextOverrides }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(`${harnessLabel} subscription plans saved.`);
      await loadHarness(draft.year);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Loading {harnessLabel} plans…
      </div>
    );
  }

  if (!draft) return null;

  const planDescription = draft.detectedPlan
    ? `Auto-detected today: ${draft.detectedPlan.label} ($${draft.detectedPlan.monthlyUsd}/mo). Override individual months when your tier changed.`
    : "Set the subscription tier per month when auto-detection is unavailable.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Monthly plans" description={planDescription} />
        {draft.years.length > 0 ? (
          <Tabs
            value={String(draft.year)}
            onValueChange={(value) => void loadHarness(Number.parseInt(value ?? "", 10))}
          >
            <TabsList variant="line" className="h-9 gap-1">
              {draft.years.map((y) => (
                <TabsTrigger key={y} value={String(y)} className="px-3">
                  {y}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      {draft.months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No usage data for {draft.year}. Import logs or billing CSV first, then set
          monthly plans here.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead>Month</TableHead>
              <TableHead>Plan tier</TableHead>
              <TableHead className="w-32">Base $/mo</TableHead>
              <TableHead className="min-w-64">Plan label</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.months.map((month) => {
              const row = draft.rows[month] ?? {
                tierId: AUTO_PLAN_TIER_ID,
                label: "",
                monthlyUsd: "",
              };
              const isCustom = row.tierId === CUSTOM_PLAN_TIER_ID;
              return (
                <TableRow key={month} className="border-border/60">
                  <TableCell className="font-medium whitespace-normal">
                    {monthLabel(month)}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Select
                      value={row.tierId}
                      onValueChange={(value) =>
                        handleTierChange(month, value ?? AUTO_PLAN_TIER_ID)
                      }
                    >
                      <SelectTrigger className="w-56 max-w-full truncate rounded-xl border-border/60 bg-card/80">
                        {tierTriggerLabel(
                          row.tierId,
                          row,
                          draft.tiers,
                          draft.detectedPlan,
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO_PLAN_TIER_ID}>
                          {draft.detectedPlan
                            ? `Auto (${draft.detectedPlan.label} · $${draft.detectedPlan.monthlyUsd}/mo)`
                            : "Auto-detected"}
                        </SelectItem>
                        {draft.tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {formatPlanTierOptionLabel(tier)}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_PLAN_TIER_ID}>Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {isCustom ? (
                      <Input
                        className="w-32"
                        value={row.monthlyUsd}
                        onChange={(e) =>
                          updateRow(month, { monthlyUsd: e.target.value })
                        }
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Amount"
                      />
                    ) : (
                      <span>{formatBaseUsd(row.monthlyUsd)}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {isCustom ? (
                      <Input
                        className="w-full min-w-48 max-w-64"
                        value={row.label}
                        onChange={(e) =>
                          updateRow(month, { label: e.target.value })
                        }
                        autoComplete="off"
                        placeholder="e.g. Enterprise deal"
                      />
                    ) : (
                      <span>{row.label.trim() || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Button type="button" onClick={() => void saveHarness()} disabled={saving}>
        {saving ? "Saving…" : `Save ${harnessLabel} plans`}
      </Button>
    </div>
  );
}

export function SubscriptionPlanSettings({
  showClaude,
  showCursor,
}: {
  showClaude: boolean;
  showCursor: boolean;
}) {
  return (
    <div className="space-y-6">
      {showClaude ? (
        <HarnessSettingsCard
          harness="claude"
          description="Set the base subscription price per month. Use this when you changed tiers mid-year or auto-detection does not match your billing."
        >
          <HarnessPlanSection harness="claude" harnessLabel="Claude Code" />
        </HarnessSettingsCard>
      ) : null}

      {showCursor ? (
        <HarnessSettingsCard
          harness="cursor"
          description="Set the base subscription price per month. Use this when you changed tiers mid-year or auto-detection does not match your billing."
        >
          <HarnessPlanSection harness="cursor" harnessLabel="Cursor" />
        </HarnessSettingsCard>
      ) : null}
    </div>
  );
}
