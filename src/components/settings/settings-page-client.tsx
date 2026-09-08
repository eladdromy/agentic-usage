"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  Database,
  LoaderCircle,
  RefreshCw,
  Upload,
  UserCircle,
} from "lucide-react";

import { BillingGapList } from "@/components/cursor/billing-gap-list";
import { ProjectSyncPanel } from "@/components/cursor/project-sync-panel";
import { useProjectSync } from "@/components/cursor/project-sync-provider";
import { UnmatchedBillingList } from "@/components/cursor/unmatched-billing-list";
import { CursorCsvUploadDialog } from "@/components/cursor/csv-upload-dialog";
import { SettingsPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { useRouteSync } from "@/components/layout/route-sync";
import { PageHeader } from "@/components/page-header";
import { HarnessSettingsCard } from "@/components/settings/harness-settings-card";
import { SubscriptionPlanSettings } from "@/components/settings/subscription-plan-settings";
import {
  SettingsActions,
  SettingsCard,
  SettingsFieldGrid,
  SettingsHelpText,
  SettingsInfoList,
  SettingsInfoRow,
  SettingsSubsection,
  settingsCompactFieldClass,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";
import type {
  ActiveHarness,
  AppSettings,
  SyncDebounceMinutes,
  SyncMethod,
} from "@/lib/profile/settings";

type ProfileResponse = {
  claudeHome: string;
  dataDir: string;
  vscdbPath: string;
  defaultVscdbPath: string;
  vscdbExists: boolean;
  activeHarness: ActiveHarness;
  claudeHomeExists: boolean;
  claudeConfigExists: boolean;
  eventCount: number;
  lastSyncAt: string | null;
  claudeEventCount: number;
  cursorEventCount: number;
  claudeLastSyncAt: string | null;
  cursorLastSyncAt: string | null;
  detectedPlan: { label: string; monthlyUsd: number } | null;
  detectedClaudePlan: { label: string; monthlyUsd: number } | null;
  detectedCursorPlan: { label: string; monthlyUsd: number } | null;
  plan: { label: string; monthlyUsd: number; source: string } | null;
  claudePlan: { label: string; monthlyUsd: number; source: string } | null;
  cursorPlan: { label: string; monthlyUsd: number; source: string } | null;
  settings: AppSettings;
  profile: {
    emailAddress: string | null;
    seatTier: string | null;
    organizationType: string | null;
  } | null;
  cursorProfile: {
    account: { cachedEmail: string | null };
    subscription: {
      stripeMembershipType: string | null;
      stripeSubscriptionStatus: string | null;
      membershipType: string | null;
      subscriptionStatus: string | null;
    };
    teams: { isEnterprise: boolean | null };
  } | null;
};

const DEBOUNCE_OPTIONS: { value: SyncDebounceMinutes; label: string }[] = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
];

const SYNC_METHOD_OPTIONS: { value: SyncMethod; label: string }[] = [
  { value: "updates_only", label: "Updates only" },
  { value: "full", label: "Full sync" },
];

const SETTINGS_TAB_ITEMS = [
  { value: "account", label: "Account", icon: UserCircle, harness: "all" as const },
  { value: "data", label: "Data", icon: Database, harness: "all" as const },
  {
    value: "subscription",
    label: "Subscription",
    icon: CreditCard,
    harness: "all" as const,
  },
  {
    value: "billing",
    label: "Billing CSV",
    icon: Upload,
    harness: "cursor" as const,
  },
];

function resolveSettingsTab(
  param: string | null,
  allowedValues: string[],
): string {
  if (param && allowedValues.includes(param)) return param;
  return allowedValues[0] ?? "account";
}

function selectedLabel<T extends { value: string; label: string }>(
  options: T[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatPlan(
  plan: { label: string; monthlyUsd: number; source: string } | null | undefined,
): string {
  if (!plan) return "Not set";
  return `${plan.label} · $${plan.monthlyUsd}/mo`;
}

function applyProfileToForm(
  json: ProfileResponse,
  setters: {
    setProfile: (v: ProfileResponse) => void;
    setSyncDebounceMinutes: (v: SyncDebounceMinutes) => void;
    setSyncMethod: (v: SyncMethod) => void;
  },
) {
  setters.setProfile(json);
  setters.setSyncDebounceMinutes(json.settings.syncDebounceMinutes);
  setters.setSyncMethod(json.settings.syncMethod);
}

export function SettingsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    syncVersion,
    syncing: routeSyncing,
    activeHarness: contextHarness,
    triggerSync,
    switchHarness,
  } = useRouteSync();
  const { startProjectSync, syncing: projectSyncing } = useProjectSync();
  const showClaudeSettings =
    contextHarness === "claude" || contextHarness === "all";
  const showCursorSettings =
    contextHarness === "cursor" || contextHarness === "all";
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [syncDebounceMinutes, setSyncDebounceMinutes] =
    useState<SyncDebounceMinutes>(1);
  const [syncMethod, setSyncMethod] = useState<SyncMethod>("updates_only");
  const [savingSync, setSavingSync] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [projectSyncRefreshKey, setProjectSyncRefreshKey] = useState(0);
  const [billingCoverage, setBillingCoverage] =
    useState<BillingCoveragePayload | null>(null);

  const tabItems = useMemo(
    () =>
      SETTINGS_TAB_ITEMS.filter((tab) => {
        if (tab.harness === "cursor") return showCursorSettings;
        return true;
      }),
    [showCursorSettings],
  );

  const allowedTabValues = useMemo(
    () => tabItems.map((tab) => tab.value),
    [tabItems],
  );

  const activeTab = resolveSettingsTab(
    searchParams.get("tab"),
    allowedTabValues,
  );

  const setSettingsTab = useCallback(
    (tab: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab === "account") next.delete("tab");
      else next.set("tab", tab);
      const qs = next.toString();
      router.replace(qs ? `/settings?${qs}` : "/settings", { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const param = searchParams.get("tab");
    if (param === "sync") {
      setSettingsTab("data");
      return;
    }
    if (param === "billing" && contextHarness === "claude") {
      void switchHarness("all");
      return;
    }
    if (param && !allowedTabValues.includes(param)) {
      setSettingsTab(allowedTabValues[0] ?? "account");
    }
  }, [
    allowedTabValues,
    contextHarness,
    searchParams,
    setSettingsTab,
    switchHarness,
  ]);

  async function loadProfile() {
    const res = await fetch("/api/profile");
    const json = (await res.json()) as ProfileResponse;
    applyProfileToForm(json, {
      setProfile,
      setSyncDebounceMinutes,
      setSyncMethod,
    });
  }

  const loadBillingCoverage = useCallback(async () => {
    const res = await fetch("/api/cursor/billing-coverage");
    if (!res.ok) return;
    setBillingCoverage((await res.json()) as BillingCoveragePayload);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (routeSyncing) return;

      const res = await fetch("/api/profile");
      const json = (await res.json()) as ProfileResponse;
      if (cancelled) return;
      applyProfileToForm(json, {
        setProfile,
        setSyncDebounceMinutes,
        setSyncMethod,
      });
      if (json.activeHarness === "cursor" || json.activeHarness === "all") {
        void loadBillingCoverage();
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [syncVersion, routeSyncing, loadBillingCoverage]);

  async function handleCsvUploaded(_result: ProviderUsageUploadResult) {
    await loadBillingCoverage();
    await loadProfile();
  }

  function handleRematchProjects() {
    void startProjectSync({
      retryUnmatched: true,
      onComplete: () => {
        setProjectSyncRefreshKey((k) => k + 1);
        void loadBillingCoverage();
      },
    });
  }

  function handleSyncComplete() {
    setProjectSyncRefreshKey((k) => k + 1);
    void loadBillingCoverage();
  }

  async function saveSyncSettings() {
    setSavingSync(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncDebounceMinutes,
          syncMethod,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Sync settings saved.");
      await loadProfile();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingSync(false);
    }
  }

  async function reindex() {
    setReindexing(true);
    try {
      const json = await triggerSync();
      if (!json) throw new Error("Sync failed");

      if (json.skipped && json.skipReason === "csv_only") {
        toast.info("Cursor uses CSV uploads — no log indexing.");
      } else if (json.skipped && json.skipReason === "debounce") {
        const mins = profile?.settings.syncDebounceMinutes ?? syncDebounceMinutes;
        toast.info(
          `Re-index skipped — last sync was less than ${mins} minute${mins === 1 ? "" : "s"} ago.`,
        );
      } else if (json.skipped && json.skipReason === "no_updates") {
        toast.info(
          json.harness === "cursor"
            ? "Re-index skipped — no vscdb updates since last sync."
            : "Re-index skipped — no log file updates since last sync.",
        );
      } else {
        const modeLabel =
          json.syncMode === "full" ? "Full sync" : "Updates only";
        if (json.harness === "cursor") {
          toast.success(
            `${modeLabel}: indexed ${json.rowsInserted ?? 0} new prompts.`,
          );
        } else {
          toast.success(
            `${modeLabel}: indexed ${json.rowsInserted ?? 0} new rows from ${json.filesScanned ?? 0} files.`,
          );
        }
      }
      await loadProfile();
      if (showCursorSettings) {
        await loadBillingCoverage();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Account, data paths, subscription plans, and billing imports."
      />

      {profile == null ? (
        <SettingsPageContentSkeleton />
      ) : (
        <Tabs value={activeTab} onValueChange={setSettingsTab}>
        <TabsList variant="line" className="h-10 flex-wrap gap-1">
          {tabItems.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-4">
              <tab.icon size={16} aria-hidden="true" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="account" className="mt-6">
          <div className="space-y-6">
            {showClaudeSettings ? (
              <HarnessSettingsCard harness="claude" description="Claude Code account.">
                <SettingsInfoList>
                  <SettingsInfoRow
                    label="Email"
                    value={profile?.profile?.emailAddress ?? "—"}
                  />
                  <SettingsInfoRow
                    label="Current plan"
                    value={formatPlan(profile?.claudePlan)}
                  />
                </SettingsInfoList>
              </HarnessSettingsCard>
            ) : null}

            {showCursorSettings ? (
              <HarnessSettingsCard harness="cursor" description="Cursor account.">
                <SettingsInfoList>
                  <SettingsInfoRow
                    label="Email"
                    value={profile?.cursorProfile?.account.cachedEmail ?? "—"}
                  />
                  <SettingsInfoRow
                    label="Current plan"
                    value={formatPlan(profile?.cursorPlan)}
                  />
                </SettingsInfoList>
              </HarnessSettingsCard>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          <div className="space-y-6">
            <SettingsCard
              icon={Database}
              title="App storage"
              description="Shared database and configuration paths."
            >
              <SettingsInfoList>
                <SettingsInfoRow
                  label="App data"
                  value={
                    <span className="break-all font-mono text-xs">
                      {profile?.dataDir ?? "—"}
                    </span>
                  }
                />
              </SettingsInfoList>
            </SettingsCard>

            {showClaudeSettings ? (
              <HarnessSettingsCard
                harness="claude"
                description="Claude Code log paths, indexing on navigation, and sync preferences."
              >
                <SettingsInfoList>
                  <SettingsInfoRow
                    label="Claude home"
                    className="max-w-sm"
                    value={
                      <span className="break-all font-mono text-xs">
                        {profile?.claudeHome ?? "—"}
                      </span>
                    }
                  />
                  <SettingsInfoRow
                    label="Indexed events"
                    className="w-fit shrink-0"
                    value={profile?.claudeEventCount?.toLocaleString() ?? "—"}
                  />
                  <SettingsInfoRow
                    label="Last sync"
                    className="w-fit shrink-0"
                    value={profile?.claudeLastSyncAt ?? "Never"}
                  />
                </SettingsInfoList>

                <SettingsSubsection
                  title="Manual indexing"
                  description="Scan Claude Code JSONL logs now. Automatic indexing also runs when you navigate between pages."
                >
                  <SettingsActions>
                    <Button variant="outline" onClick={reindex} disabled={reindexing}>
                      {reindexing ? (
                        <>
                          <LoaderCircle
                            size={16}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                          Re-indexing…
                        </>
                      ) : (
                        "Re-index logs"
                      )}
                    </Button>
                  </SettingsActions>
                </SettingsSubsection>

                <SettingsSubsection title="Automatic sync">
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSyncSettings();
                    }}
                    className="space-y-4"
                  >
                    <SettingsFieldGrid>
                      <Field className={settingsCompactFieldClass}>
                        <FieldLabel>Minimum time between syncs</FieldLabel>
                        <Select
                          value={String(syncDebounceMinutes)}
                          onValueChange={(value) =>
                            setSyncDebounceMinutes(
                              Number.parseInt(value ?? "1", 10) as SyncDebounceMinutes,
                            )
                          }
                        >
                          <SelectTrigger className={settingsSelectTriggerClass}>
                            {
                              DEBOUNCE_OPTIONS.find(
                                (o) => o.value === syncDebounceMinutes,
                              )?.label
                            }
                          </SelectTrigger>
                          <SelectContent>
                            {DEBOUNCE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className="max-w-prose shrink-0">
                        <FieldLabel>Sync method</FieldLabel>
                        <div className={settingsCompactFieldClass}>
                          <Select
                            value={syncMethod}
                            onValueChange={(value) =>
                              setSyncMethod((value as SyncMethod) ?? "updates_only")
                            }
                          >
                            <SelectTrigger className={settingsSelectTriggerClass}>
                              {selectedLabel(SYNC_METHOD_OPTIONS, syncMethod)}
                            </SelectTrigger>
                            <SelectContent>
                              {SYNC_METHOD_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <SettingsHelpText>
                          Updates only scans JSONL files changed since the last sync.
                          Full sync scans every log file. The first sync is always full
                          when the database is empty.
                        </SettingsHelpText>
                      </Field>
                    </SettingsFieldGrid>
                    <SettingsActions>
                      <Button type="submit" disabled={savingSync}>
                        {savingSync ? "Saving…" : "Save sync settings"}
                      </Button>
                    </SettingsActions>
                  </form>
                </SettingsSubsection>
              </HarnessSettingsCard>
            ) : null}

            {showCursorSettings ? (
              <HarnessSettingsCard
                harness="cursor"
                description="Cursor local database path and imported billing row counts."
              >
                <SettingsInfoList>
                  <SettingsInfoRow
                    label="vscdb path"
                    className="max-w-xs"
                    value={
                      <span className="break-all font-mono text-xs">
                        {profile?.vscdbPath ?? "—"}
                      </span>
                    }
                  />
                  <SettingsInfoRow
                    label="Billing CSV rows"
                    className="w-fit shrink-0"
                    value={profile?.cursorEventCount?.toLocaleString() ?? "—"}
                  />
                  <SettingsInfoRow
                    label="Last import"
                    className="w-fit shrink-0"
                    value={profile?.cursorLastSyncAt ?? "Never"}
                  />
                </SettingsInfoList>
              </HarnessSettingsCard>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="mt-6">
          <SubscriptionPlanSettings
            showClaude={showClaudeSettings}
            showCursor={showCursorSettings}
          />
        </TabsContent>

        {showCursorSettings ? (
          <TabsContent value="billing" className="mt-6">
            <HarnessSettingsCard
              harness="cursor"
              description="Import usage-events CSV exports for billed tokens and cost. After upload, local state.vscdb is scanned only in the CSV date range to attach project paths."
            >
              <SettingsSubsection divider={false} title="Import & matching">
                <SettingsActions>
                  <Button type="button" onClick={() => setUploadOpen(true)}>
                    <Upload size={16} aria-hidden="true" />
                    Upload CSV
                  </Button>
                  {billingCoverage?.imports.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={projectSyncing}
                      onClick={handleRematchProjects}
                    >
                      {projectSyncing ? (
                        <LoaderCircle
                          size={16}
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <RefreshCw size={16} aria-hidden="true" />
                      )}
                      Re-match projects
                    </Button>
                  ) : null}
                </SettingsActions>
                <SettingsActions>
                  {billingCoverage?.costSourceAvailable ? (
                    <ProjectSyncPanel
                      refreshKey={projectSyncRefreshKey}
                      syncing={projectSyncing}
                    />
                  ) : null}
                  {billingCoverage ? (
                    <BillingGapList coverage={billingCoverage} />
                  ) : null}
                  {billingCoverage ? (
                    <UnmatchedBillingList coverage={billingCoverage} />
                  ) : null}
                </SettingsActions>
              </SettingsSubsection>
              <CursorCsvUploadDialog
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                onUploaded={handleCsvUploaded}
                onSyncComplete={handleSyncComplete}
              />
            </HarnessSettingsCard>
          </TabsContent>
        ) : null}
      </Tabs>
      )}

      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
