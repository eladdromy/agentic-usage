import type { Metadata } from "next";
import { Suspense } from "react";

import { RawSpendPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { RawSpendPageClient } from "@/components/raw-spend/raw-spend-page-client";

export const metadata: Metadata = {
  title: "Spend Logs",
};

export default function RawSpendPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader
            eyebrow="Audit"
            title="Spend Logs"
            description="Per-request token breakdown and API-equivalent cost."
          />
          <RawSpendPageContentSkeleton />
        </div>
      }
    >
      <RawSpendPageClient />
    </Suspense>
  );
}
