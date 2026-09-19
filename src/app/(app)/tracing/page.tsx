import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { TracingExplorerSkeleton } from "@/components/layout/page-loading-skeletons";
import { TracingExplorer } from "@/components/tracing/tracing-explorer";

export const metadata: Metadata = {
  title: "Tracing",
};

const DESCRIPTION =
  "Explore Claude Code sessions by project. Open a session to trace its interactions, requests, and per-request breakdown.";

export default function TracingPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader eyebrow="Tracing" title="Tracing" description={DESCRIPTION} />
          <TracingExplorerSkeleton />
        </div>
      }
    >
      <TracingExplorer />
    </Suspense>
  );
}
