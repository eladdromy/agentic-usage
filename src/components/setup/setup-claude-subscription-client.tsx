"use client";

import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { SubscriptionPlanReview } from "@/components/settings/subscription-plan-review";
import { SetupStepCard } from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";
import { nextPathAfterClaudeSubscription } from "@/lib/onboarding/navigation";

export function SetupClaudeSubscriptionClient() {
  const router = useRouter();
  const { status, loading, refresh } = useOnboardingStatus();

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        Loading subscription details…
      </div>
    );
  }

  return (
    <SetupStepCard
      title="Review Claude subscription"
      description="Confirm the plan tier for each month with usage. Adjust any month where your subscription changed."
    >
      <SubscriptionPlanReview
        harness="claude"
        harnessLabel="Claude Code"
        approveLabel="Approve & continue"
        onApproved={async () => {
          const next = await refresh();
          if (next) router.push(nextPathAfterClaudeSubscription(next));
        }}
      />
    </SetupStepCard>
  );
}
