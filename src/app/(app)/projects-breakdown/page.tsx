import type { Metadata } from "next";
import { Suspense } from "react";

import { ProjectsBreakdownPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { ProjectsBreakdownPageClient } from "@/components/projects-breakdown/projects-breakdown-page-client";

export const metadata: Metadata = {
  title: "Projects breakdown",
};

export default function ProjectsBreakdownPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader
            title="Projects breakdown"
            description={
              <>
                All-time spend and API-equivalent cost by project.
                <br />
                Same workspace in multiple harnesses is combined; expand a row to see
                per-harness breakdown.
              </>
            }
          />
          <ProjectsBreakdownPageContentSkeleton />
        </div>
      }
    >
      <ProjectsBreakdownPageClient />
    </Suspense>
  );
}
