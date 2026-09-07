import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { resolveActiveHarness } from "@/lib/profile/settings";

export const metadata: Metadata = {
  title: "Agentic Usage",
  description:
    "Local observability dashboard for coding agent harness usage, spend, and subscription leverage",
};

export default function AppLayout({ children }: LayoutProps<"/">) {
  const initialActiveHarness = resolveActiveHarness();

  return (
    <AppShell initialActiveHarness={initialActiveHarness}>{children}</AppShell>
  );
}
