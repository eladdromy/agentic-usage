import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Agentic Usage",
  description:
    "Local observability dashboard for coding agent harness usage, spend, and subscription leverage",
};

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
