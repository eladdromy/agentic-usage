"use client";

import { ProjectSyncProvider } from "@/components/cursor/project-sync-provider";
import { RouteSyncProvider } from "@/components/layout/route-sync";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function SetupProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <RouteSyncProvider initialActiveHarness="claude">
        <ProjectSyncProvider>{children}</ProjectSyncProvider>
      </RouteSyncProvider>
      <Toaster richColors closeButton />
    </TooltipProvider>
  );
}
