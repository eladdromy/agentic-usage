import type { Metadata } from "next";
import { Suspense } from "react";

import { PlanLeveragePageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { PlanLeveragePageClient } from "@/components/leverage/plan-leverage-page-client";

export const metadata: Metadata = {
  title: "Plan Leverage",
};

export default function PlanLeveragePage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader
            eyebrow="Analytics"
            title="Plan Leverage"
            description={
              <>
                How much usage value you get for what you pay — leverage from subsidized
                subscription usage.
                <br />
                Expand a month to see per-harness breakdown.
              </>
            }
          />
          <PlanLeveragePageContentSkeleton />
        </div>
      }
    >
      <PlanLeveragePageClient />
    </Suspense>
  );
}
