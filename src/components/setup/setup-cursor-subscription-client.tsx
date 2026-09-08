"use client";

import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { SubscriptionPlanReview } from "@/components/settings/subscription-plan-review";
import { SetupStepCard } from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { nextPathAfterCursorSubscription } from "@/lib/onboarding/navigation";

export function SetupCursorSubscriptionClient() {
  const router = useRouter();
  const { loading, refresh } = useOnboardingStatus();

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
      title="Review Cursor subscription"
      description="Confirm the plan tier for each month with billing data. Adjust any month where your subscription changed."
    >
      <SubscriptionPlanReview
        harness="cursor"
        harnessLabel="Cursor"
        approveLabel="Approve & continue"
        onApproved={async () => {
          await refresh();
          router.push(nextPathAfterCursorSubscription());
        }}
      />
    </SetupStepCard>
  );
}
