"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { SetupStepCard } from "@/components/setup/setup-shell";
import { useOnboardingStatus } from "@/components/setup/use-onboarding-status";

export function SetupCompleteClient() {
  const router = useRouter();
  const { status, loading } = useOnboardingStatus();

  useEffect(() => {
    if (!status) return;

    const current = status;

    async function finish() {
      if (current.onboardingComplete) {
        router.replace("/leverage");
        return;
      }

      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deferredCursor: current.settings.onboardingDeferredCursor,
        }),
      });
      if (!res.ok) return;
      router.replace("/leverage");
    }

    void finish();
  }, [router, status]);

  return (
    <SetupStepCard
      title="Setup complete"
      description="Taking you to Plan Leverage…"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {loading || !status ? (
          <>
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            Finalizing…
          </>
        ) : (
          <>
            <CircleCheck size={18} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Ready
          </>
        )}
      </div>
    </SetupStepCard>
  );
}
