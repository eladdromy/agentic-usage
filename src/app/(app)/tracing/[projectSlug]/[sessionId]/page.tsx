import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { SessionTraceSkeleton } from "@/components/layout/page-loading-skeletons";
import { SessionTraceView } from "@/components/tracing/session-trace-view";

export const metadata: Metadata = {
  title: "Session trace",
};

export default async function SessionTracePage({
  params,
}: {
  params: Promise<{ projectSlug: string; sessionId: string }>;
}) {
  const { projectSlug, sessionId } = await params;

  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader title="Session trace" />
          <SessionTraceSkeleton />
        </div>
      }
    >
      <SessionTraceView
        projectKey={decodeURIComponent(projectSlug)}
        sessionId={decodeURIComponent(sessionId)}
      />
    </Suspense>
  );
}
