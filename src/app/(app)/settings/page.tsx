import type { Metadata } from "next";
import { Suspense } from "react";

import { SettingsPageContentSkeleton } from "@/components/layout/page-loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { SettingsPageClient } from "@/components/settings/settings-page-client";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader
            eyebrow="Configuration"
            title="Settings"
            description="Account, data paths, subscription plans, and billing imports."
          />
          <SettingsPageContentSkeleton />
        </div>
      }
    >
      <SettingsPageClient />
    </Suspense>
  );
}
