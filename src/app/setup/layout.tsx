import { redirect } from "next/navigation";

import { SetupProviders } from "@/components/setup/setup-providers";
import { SetupShell } from "@/components/setup/setup-shell";
import { readSettings } from "@/lib/profile/settings";

export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  if (readSettings().onboardingCompletedAt) {
    redirect("/leverage");
  }

  return (
    <SetupProviders>
      <SetupShell>{children}</SetupShell>
    </SetupProviders>
  );
}
