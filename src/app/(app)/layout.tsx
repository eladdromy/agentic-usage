import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { isOnboardingComplete, migrateLegacyOnboardingIfNeeded } from "@/lib/onboarding/status";
import { resolveActiveHarness } from "@/lib/profile/settings";

export const metadata: Metadata = {
  title: "Agentic Usage",
  description:
    "Local observability dashboard for coding agent harness usage, spend, and subscription leverage",
};

export default function AppLayout({ children }: LayoutProps<"/">) {
  migrateLegacyOnboardingIfNeeded();

  if (!isOnboardingComplete()) {
    redirect("/setup");
  }

  const initialActiveHarness = resolveActiveHarness();

  return (
    <AppShell initialActiveHarness={initialActiveHarness}>{children}</AppShell>
  );
}
