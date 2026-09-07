import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Plan Leverage",
  description: "Local Claude Code spending and plan leverage viewer",
};

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
