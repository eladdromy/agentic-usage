import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { TracingSessionsSkeleton } from "@/components/layout/page-loading-skeletons";
import { TraceSessionsClient } from "@/components/tracing/trace-sessions-client";

export const metadata: Metadata = {
  title: "Sessions",
};

export default async function TracingProjectPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const decoded = decodeURIComponent(projectSlug);

  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader title="Sessions" />
          <TracingSessionsSkeleton />
        </div>
      }
    >
      <TraceSessionsClient projectKey={decoded} />
    </Suspense>
  );
}
