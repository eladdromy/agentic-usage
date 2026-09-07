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
import { UnmatchedBillingList } from "@/components/cursor/unmatched-billing-list";
import { CursorCsvUploadDialog } from "@/components/cursor/csv-upload-dialog";
import { SettingsPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { useRouteSync } from "@/components/layout/route-sync";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { HarnessSettingsCard } from "@/components/settings/harness-settings-card";
import { SubscriptionPlanSettings } from "@/components/settings/subscription-plan-settings";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { MetricSurface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BillingCoveragePayload } from "@/lib/cursor/billing-coverage-shared";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";
import type {
  ActiveHarness,
  AppSettings,
  SyncDebounceMinutes,
  SyncMethod,
} from "@/lib/profile/settings";
import { cn } from "@/lib/utils";

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
  { value: "sync", label: "Sync", icon: RefreshCw, harness: "claude" as const },
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

function InfoRowList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "flex w-fit flex-wrap items-start gap-x-8 gap-y-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-md space-y-1", className)}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed">{value}</dd>
    </div>
  );
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
  } = useRouteSync();
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
  const [projectSyncKey, setProjectSyncKey] = useState(0);
  const [projectSyncRetry, setProjectSyncRetry] = useState(false);
  const [projectSyncing, setProjectSyncing] = useState(false);
  const [billingCoverage, setBillingCoverage] =
    useState<BillingCoveragePayload | null>(null);

  const tabItems = useMemo(
    () =>
      SETTINGS_TAB_ITEMS.filter((tab) => {
        if (tab.harness === "claude") return showClaudeSettings;
        if (tab.harness === "cursor") return showCursorSettings;
        return true;
      }),
    [showClaudeSettings, showCursorSettings],
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
    if (param && !allowedTabValues.includes(param)) {
      setSettingsTab(allowedTabValues[0] ?? "account");
    }
  }, [allowedTabValues, searchParams, setSettingsTab]);

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

  async function handleCsvUploaded(result: ProviderUsageUploadResult) {
    setMessage(
      `Imported ${result.inserted.toLocaleString()} billing rows` +
        (result.skipped > 0
          ? ` (${result.skipped.toLocaleString()} duplicates skipped)`
          : "") +
        " — syncing projects by month…",
    );
    await loadBillingCoverage();
    await loadProfile();
    setProjectSyncRetry(false);
    setProjectSyncKey((k) => k + 1);
  }

  function handleRematchProjects() {
    setMessage("Syncing projects by month…");
    setProjectSyncRetry(true);
    setProjectSyncKey((k) => k + 1);
  }

  function handleProjectSyncComplete() {
    setMessage("Project sync finished.");
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
    setMessage(null);
    try {
      const json = await triggerSync();
      if (!json) throw new Error("Sync failed");

      if (json.skipped && json.skipReason === "csv_only") {
        setMessage("Cursor uses CSV uploads — no log indexing.");
      } else if (json.skipped && json.skipReason === "debounce") {
        const mins = profile?.settings.syncDebounceMinutes ?? syncDebounceMinutes;
        setMessage(
          `Re-index skipped — last sync was less than ${mins} minute${mins === 1 ? "" : "s"} ago.`,
        );
      } else if (json.skipped && json.skipReason === "no_updates") {
        setMessage(
          json.harness === "cursor"
            ? "Re-index skipped — no vscdb updates since last sync."
            : "Re-index skipped — no log file updates since last sync.",
        );
      } else {
        const modeLabel =
          json.syncMode === "full" ? "Full sync" : "Updates only";
        if (json.harness === "cursor") {
          setMessage(
            `${modeLabel}: indexed ${json.rowsInserted ?? 0} new prompts.`,
          );
        } else {
          setMessage(
            `${modeLabel}: indexed ${json.rowsInserted ?? 0} new rows from ${json.filesScanned ?? 0} files.`,
          );
        }
      }
      await loadProfile();
      if (showCursorSettings) {
        await loadBillingCoverage();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Account, data paths, sync, subscription plans, and billing imports."
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
                <InfoRowList>
                  <InfoRow
                    label="Email"
                    value={profile?.profile?.emailAddress ?? "—"}
                  />
                  <InfoRow
                    label="Current plan"
                    value={formatPlan(profile?.claudePlan)}
                  />
                </InfoRowList>
              </HarnessSettingsCard>
            ) : null}

            {showCursorSettings ? (
              <HarnessSettingsCard harness="cursor" description="Cursor account.">
                <InfoRowList>
                  <InfoRow
                    label="Email"
                    value={profile?.cursorProfile?.account.cachedEmail ?? "—"}
                  />
                  <InfoRow
                    label="Current plan"
                    value={formatPlan(profile?.cursorPlan)}
                  />
                </InfoRowList>
              </HarnessSettingsCard>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          <div className="space-y-6">
            <MetricSurface className="section-stack">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Database size={20} aria-hidden="true" />
                </div>
                <SectionHeader
                  title="App storage"
                  description="Shared database and configuration paths."
                />
              </div>
              <InfoRowList>
                <InfoRow
                  label="App data"
                  value={
                    <span className="break-all font-mono text-xs">
                      {profile?.dataDir ?? "—"}
                    </span>
                  }
                />
              </InfoRowList>
            </MetricSurface>

            {showClaudeSettings ? (
              <HarnessSettingsCard
                harness="claude"
                description="Claude Code log paths and indexed usage."
              >
                <InfoRowList>
                  <InfoRow
                    label="Claude home"
                    className="max-w-sm"
                    value={
                      <span className="break-all font-mono text-xs">
                        {profile?.claudeHome ?? "—"}
                      </span>
                    }
                  />
                  <InfoRow
                    label="Indexed events"
                    className="w-fit shrink-0"
                    value={profile?.claudeEventCount?.toLocaleString() ?? "—"}
                  />
                  <InfoRow
                    label="Last sync"
                    className="w-fit shrink-0"
                    value={profile?.claudeLastSyncAt ?? "Never"}
                  />
                </InfoRowList>
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
              </HarnessSettingsCard>
            ) : null}

            {showCursorSettings ? (
              <HarnessSettingsCard
                harness="cursor"
                description="Cursor local database and billing CSV imports."
              >
                <InfoRowList>
                  <InfoRow
                    label="vscdb path"
                    className="max-w-xs"
                    value={
                      <span className="break-all font-mono text-xs">
                        {profile?.vscdbPath ?? "—"}
                      </span>
                    }
                  />
                  <InfoRow
                    label="Billing CSV rows"
                    className="w-fit shrink-0"
                    value={profile?.cursorEventCount?.toLocaleString() ?? "—"}
                  />
                  <InfoRow
                    label="Last import"
                    className="w-fit shrink-0"
                    value={profile?.cursorLastSyncAt ?? "Never"}
                  />
                </InfoRowList>
              </HarnessSettingsCard>
            ) : null}
          </div>
        </TabsContent>

        {showClaudeSettings ? (
          <TabsContent value="sync" className="mt-6">
            <HarnessSettingsCard
              harness="claude"
              description="Controls automatic re-index on route navigation and manual Re-index in the Data tab."
            >
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  saveSyncSettings();
                }}
                className="flex w-fit max-w-3xl flex-wrap items-start gap-x-8 gap-y-4"
              >
                <Field className="min-w-52">
                  <FieldLabel>Minimum time between syncs</FieldLabel>
                  <Select
                    value={String(syncDebounceMinutes)}
                    onValueChange={(value) =>
                      setSyncDebounceMinutes(
                        Number.parseInt(value ?? "1", 10) as SyncDebounceMinutes,
                      )
                    }
                  >
                    <SelectTrigger className="w-full min-w-52 rounded-xl border-border/60 bg-card/80">
                      {
                        DEBOUNCE_OPTIONS.find((o) => o.value === syncDebounceMinutes)
                          ?.label
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
                <Field className="min-w-52">
                  <FieldLabel>Sync method</FieldLabel>
                  <Select
                    value={syncMethod}
                    onValueChange={(value) =>
                      setSyncMethod((value as SyncMethod) ?? "updates_only")
                    }
                  >
                    <SelectTrigger className="w-full min-w-52 rounded-xl border-border/60 bg-card/80">
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
                  <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    Updates only scans JSONL files changed since the last sync. Full
                    sync scans every log file. The first sync is always full when the
                    database is empty.
                  </p>
                </Field>
                <div className="basis-full">
                  <Button type="submit" disabled={savingSync}>
                    {savingSync ? "Saving…" : "Save sync settings"}
                  </Button>
                </div>
              </form>
            </HarnessSettingsCard>
          </TabsContent>
        ) : null}

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
              <div className="flex flex-wrap gap-2">
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
              </div>
              {billingCoverage?.costSourceAvailable ? (
                <ProjectSyncPanel
                  syncKey={projectSyncKey}
                  retryUnmatched={projectSyncRetry}
                  onSyncingChange={setProjectSyncing}
                  onComplete={handleProjectSyncComplete}
                />
              ) : null}
              {billingCoverage ? (
                <>
                  <BillingGapList coverage={billingCoverage} />
                  <UnmatchedBillingList coverage={billingCoverage} />
                </>
              ) : null}
              {billingCoverage?.imports.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Recent imports
                  </p>
                  <ul className="space-y-2 text-sm">
                    {billingCoverage.imports.slice(0, 5).map((item) => (
                      <li
                        key={`${item.filename}:${item.importedAt}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                      >
                        <span className="truncate font-mono text-xs">
                          {item.filename}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          +{item.rowsInserted.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <CursorCsvUploadDialog
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                onUploaded={handleCsvUploaded}
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
