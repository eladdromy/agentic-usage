"use client";

import { HarnessSettingsCard } from "@/components/settings/harness-settings-card";
import { SubscriptionPlanReview } from "@/components/settings/subscription-plan-review";

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
          <SubscriptionPlanReview
            harness="claude"
            harnessLabel="Claude Code"
            approveLabel="Save Claude Code plans"
            mode="settings"
          />
        </HarnessSettingsCard>
      ) : null}

      {showCursor ? (
        <HarnessSettingsCard
          harness="cursor"
          description="Set the base subscription price per month. Use this when you changed tiers mid-year or auto-detection does not match your billing."
        >
          <SubscriptionPlanReview
            harness="cursor"
            harnessLabel="Cursor"
            approveLabel="Save Cursor plans"
            mode="settings"
          />
        </HarnessSettingsCard>
      ) : null}
    </div>
  );
}
