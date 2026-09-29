"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SubscriptionPlanReview } from "@/components/settings/subscription-plan-review";
import { SetupStepCard } from "@/components/setup/setup-shell";
import { setupSubscriptionDescription } from "@/components/setup/setup-subscription-description";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { nextPathAfterClaudeSubscription } from "@/lib/onboarding/navigation";
import { claudeSubscriptionProgress } from "@/lib/onboarding/setup-steps";

export function SetupClaudeSubscriptionClient() {
  const router = useRouter();
  const { refresh } = useOnboardingStatus();
  const [detectedPlan, setDetectedPlan] = useState<{
    label: string;
    monthlyUsd: number;
  } | null>(null);

  return (
    <SetupStepCard
      className="space-y-4"
      setupProgress={claudeSubscriptionProgress()}
      title="Review Claude subscription"
      description={setupSubscriptionDescription(
        "Confirm the plan tier for each month with usage. Adjust any month where your subscription changed.",
        detectedPlan,
      )}
    >
      <SubscriptionPlanReview
        harness="claude"
        harnessLabel="Claude Code"
        approveLabel="Approve & continue"
        onDetectedPlanChange={setDetectedPlan}
        onApproved={async () => {
          const next = await refresh();
          if (next) router.push(nextPathAfterClaudeSubscription(next));
        }}
      />
    </SetupStepCard>
  );
}
