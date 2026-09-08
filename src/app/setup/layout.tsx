import { redirect } from "next/navigation";

import { SetupProviders } from "@/components/setup/setup-providers";
import { SetupShell } from "@/components/setup/setup-shell";
import { migrateLegacyOnboardingIfNeeded } from "@/lib/onboarding/status";

export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  const settings = migrateLegacyOnboardingIfNeeded();
  if (settings.onboardingCompletedAt) {
    redirect("/leverage");
  }

  return (
    <SetupProviders>
      <SetupShell>{children}</SetupShell>
    </SetupProviders>
  );
}
