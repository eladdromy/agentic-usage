"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  SettingsActions,
  SettingsBlockTitle,
  settingsSelectTriggerClass,
} from "@/components/settings/settings-ui";
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

type YearDraft = {
  months: string[];
  rows: Record<string, MonthDraft>;
};

type HarnessPlanState = {
  years: number[];
  detectedPlan: HarnessDraft["detectedPlan"];
  tiers: PlanTierPreset[];
  activeYear: number;
  draftsByYear: Record<number, YearDraft>;
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

function yearDraftFromResponse(data: PlanMonthsResponse): YearDraft {
  const rows: Record<string, MonthDraft> = {};
  for (const month of data.months) {
    rows[month] = draftFromOverride(
      data.overrides[month],
      data.resolvedByMonth[month],
    );
  }
  return { months: data.months, rows };
}

function harnessDraftFromState(state: HarnessPlanState): HarnessDraft {
  const yearDraft = state.draftsByYear[state.activeYear] ?? {
    months: [],
    rows: {},
  };
  return {
    year: state.activeYear,
    years: state.years,
    months: yearDraft.months,
    detectedPlan: state.detectedPlan,
    tiers: state.tiers,
    rows: yearDraft.rows,
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

export function SubscriptionPlanReview({
  harness,
  harnessLabel,
  approveLabel,
  onApproved,
  mode = "onboarding",
}: {
  harness: HarnessKind;
  harnessLabel: string;
  approveLabel?: string;
  onApproved?: () => void | Promise<void>;
  mode?: "onboarding" | "settings";
}) {
  const [state, setState] = useState<HarnessPlanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingYear, setLoadingYear] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPlanMonths = useCallback(async (year?: number) => {
    const params = new URLSearchParams({ harness });
    if (year != null) params.set("year", String(year));
    const res = await fetch(`/api/settings/plan-months?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load plan months");
    return (await res.json()) as PlanMonthsResponse;
  }, [harness]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const json = await fetchPlanMonths();
        if (cancelled) return;
        setState({
          years: json.years,
          detectedPlan: json.detectedPlan,
          tiers: json.tiers,
          activeYear: json.year,
          draftsByYear: { [json.year]: yearDraftFromResponse(json) },
        });
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load plans");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [fetchPlanMonths]);

  async function switchYear(nextYear: number) {
    if (!state || state.activeYear === nextYear) return;

    if (state.draftsByYear[nextYear]) {
      setState((current) =>
        current ? { ...current, activeYear: nextYear } : current,
      );
      return;
    }

    setLoadingYear(nextYear);
    try {
      const json = await fetchPlanMonths(nextYear);
      setState((current) =>
        current
          ? {
              ...current,
              activeYear: nextYear,
              years: json.years,
              detectedPlan: json.detectedPlan,
              tiers: json.tiers,
              draftsByYear: {
                ...current.draftsByYear,
                [nextYear]: yearDraftFromResponse(json),
              },
            }
          : current,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load plans");
    } finally {
      setLoadingYear(null);
    }
  }

  function updateRow(month: string, patch: Partial<MonthDraft>) {
    setState((current) => {
      if (!current) return current;
      const yearDraft = current.draftsByYear[current.activeYear];
      if (!yearDraft) return current;
      const existing = yearDraft.rows[month] ?? {
        tierId: AUTO_PLAN_TIER_ID,
        label: "",
        monthlyUsd: "",
      };
      return {
        ...current,
        draftsByYear: {
          ...current.draftsByYear,
          [current.activeYear]: {
            ...yearDraft,
            rows: {
              ...yearDraft.rows,
              [month]: { ...existing, ...patch },
            },
          },
        },
      };
    });
  }

  function handleTierChange(month: string, tierId: string) {
    if (!state) return;
    if (tierId === AUTO_PLAN_TIER_ID) {
      const resolved = state.detectedPlan;
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
    const preset = state.tiers.find((tier) => tier.id === tierId);
    if (!preset) return;
    updateRow(month, {
      tierId,
      label: preset.label,
      monthlyUsd: String(preset.monthlyUsd),
    });
  }

  async function saveAndApprove() {
    if (!state) return;
    setSaving(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const settings = (await settingsRes.json()) as AppSettingsSubset;
      let mergedHarnessOverrides = settings.planOverrides?.[harness] ?? {};

      for (const [yearKey, yearDraft] of Object.entries(state.draftsByYear)) {
        const year = Number.parseInt(yearKey, 10);
        const yearOverrides = overridesFromDraft(harness, {
          year,
          years: state.years,
          months: yearDraft.months,
          detectedPlan: state.detectedPlan,
          tiers: state.tiers,
          rows: yearDraft.rows,
        });
        mergedHarnessOverrides = mergeHarnessPlanOverrides(
          mergedHarnessOverrides,
          year,
          yearOverrides,
        );
      }

      const nextOverrides: PlanOverridesByHarness = {
        ...(settings.planOverrides ?? {}),
        [harness]: mergedHarnessOverrides,
      };

      const approvalKey =
        harness === "claude"
          ? "onboardingClaudeSubscriptionApproved"
          : "onboardingCursorSubscriptionApproved";

      const payload: Record<string, unknown> = {
        planOverrides: nextOverrides,
      };
      if (mode === "onboarding") {
        payload[approvalKey] = true;
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");

      if (mode === "settings") {
        toast.success(`${harnessLabel} subscription plans saved.`);
      }

      await onApproved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !state) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Loading {harnessLabel} plans…
      </div>
    );
  }

  if (!state) return null;

  const draft = harnessDraftFromState(state);
  const yearLoading = loadingYear === state.activeYear;

  const planDescription = state.detectedPlan
    ? `Auto-detected today: ${state.detectedPlan.label} ($${state.detectedPlan.monthlyUsd}/mo). Override individual months when your tier changed.`
    : "Set the subscription tier per month when auto-detection is unavailable.";

  return (
    <div className="space-y-4">
      <SettingsBlockTitle title="Monthly plans" description={planDescription} />
      {state.years.length > 0 ? (
        <Tabs
          value={String(state.activeYear)}
          onValueChange={(value) => void switchYear(Number.parseInt(value ?? "", 10))}
        >
          <TabsList variant="line" className="h-9 justify-start gap-1">
            {state.years.map((y) => (
              <TabsTrigger key={y} value={String(y)} className="px-3">
                {y}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {yearLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          Loading {state.activeYear} plans…
        </div>
      ) : draft.months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No usage data for {state.activeYear}. Import logs or billing CSV first, then set
          monthly plans here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm dark:bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="px-4">Month</TableHead>
                <TableHead className="px-4">Plan tier</TableHead>
                <TableHead className="w-32 px-4">Base $/mo</TableHead>
                <TableHead className="min-w-64 px-4">Plan label</TableHead>
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
                  <TableRow key={month} className="border-border/60 hover:bg-muted/20">
                    <TableCell className="px-4 font-medium whitespace-normal">
                      {monthLabel(month)}
                    </TableCell>
                    <TableCell className="px-4 whitespace-normal">
                      <Select
                        value={row.tierId}
                        onValueChange={(value) =>
                          handleTierChange(month, value ?? AUTO_PLAN_TIER_ID)
                        }
                      >
                        <SelectTrigger className={settingsSelectTriggerClass}>
                          {tierTriggerLabel(
                            row.tierId,
                            row,
                            state.tiers,
                            state.detectedPlan,
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO_PLAN_TIER_ID}>
                            {state.detectedPlan
                              ? `Auto (${state.detectedPlan.label} · $${state.detectedPlan.monthlyUsd}/mo)`
                              : "Auto-detected"}
                          </SelectItem>
                          {state.tiers.map((tier) => (
                            <SelectItem key={tier.id} value={tier.id}>
                              {formatPlanTierOptionLabel(tier)}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_PLAN_TIER_ID}>Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="px-4 whitespace-normal">
                      {isCustom ? (
                        <Input
                          className="w-32 bg-background"
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
                    <TableCell className="px-4 whitespace-normal">
                      {isCustom ? (
                        <Input
                          className="w-full min-w-48 max-w-64 bg-background"
                          value={row.label}
                          onChange={(e) => updateRow(month, { label: e.target.value })}
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
        </div>
      )}

      <SettingsActions className={mode === "onboarding" ? "justify-end" : undefined}>
        <Button
          type="button"
          onClick={() => void saveAndApprove()}
          disabled={saving || draft.months.length === 0}
        >
          {saving
            ? "Saving…"
            : (approveLabel ?? `Approve ${harnessLabel} subscription details`)}
        </Button>
      </SettingsActions>
    </div>
  );
}

type AppSettingsSubset = {
  planOverrides?: PlanOverridesByHarness;
};

export {
  monthLabel as subscriptionMonthLabel,
  overridesFromDraft,
  mergeHarnessPlanOverrides,
  yearDraftFromResponse,
  harnessDraftFromState,
  type PlanMonthsResponse,
  type HarnessPlanState,
  type MonthDraft,
  type HarnessDraft,
};
