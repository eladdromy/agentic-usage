import { redirect } from "next/navigation";

import { SetupProviders } from "@/components/setup/setup-providers";
import { SetupShell } from "@/components/setup/setup-shell";
import { isOnboardingComplete } from "@/lib/onboarding/status";

export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  if (isOnboardingComplete()) {
    redirect("/leverage");
  }

  return (
    <SetupProviders>
      <SetupShell>{children}</SetupShell>
    </SetupProviders>
  );
}
