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
            description="Monthly API-equivalent spend divided by your plan spend."
          />
          <PlanLeveragePageContentSkeleton />
        </div>
      }
    >
      <PlanLeveragePageClient />
    </Suspense>
  );
}
