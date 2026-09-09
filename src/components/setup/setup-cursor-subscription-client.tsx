"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { SubscriptionPlanReview } from "@/components/settings/subscription-plan-review";
import { SetupStepCard } from "@/components/setup/setup-shell";
import { setupSubscriptionDescription } from "@/components/setup/setup-subscription-description";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { nextPathAfterCursorSubscription } from "@/lib/onboarding/navigation";
import { CURSOR_SETUP_STEPS } from "@/lib/onboarding/setup-steps";

export function SetupCursorSubscriptionClient() {
  const router = useRouter();
  const { loading, refresh } = useOnboardingStatus();
  const [detectedPlan, setDetectedPlan] = useState<{
    label: string;
    monthlyUsd: number;
  } | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Loading subscription details…
      </div>
    );
  }

  return (
    <SetupStepCard
      className="space-y-4"
      setupProgress={CURSOR_SETUP_STEPS.subscription}
      title="Review Cursor subscription"
      description={setupSubscriptionDescription(
        "Confirm the plan tier for each month with billing data. Adjust any month where your subscription changed.",
        detectedPlan,
      )}
    >
      <SubscriptionPlanReview
        harness="cursor"
        harnessLabel="Cursor"
        approveLabel="Approve & continue"
        onDetectedPlanChange={setDetectedPlan}
        onApproved={async () => {
          await refresh();
          router.push(nextPathAfterCursorSubscription());
        }}
      />
    </SetupStepCard>
  );
}
