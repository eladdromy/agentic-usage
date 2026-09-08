"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BarChart3, FolderKanban, LoaderCircle, Receipt, Settings } from "lucide-react";

import { CursorSetupBannerGate } from "@/components/cursor/cursor-setup-banner-gate";
import { HarnessSelect } from "@/components/layout/harness-select";
import { RouteSyncProvider, useRouteSync } from "@/components/layout/route-sync";
import { ProjectSyncProvider } from "@/components/cursor/project-sync-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ActiveHarness } from "@/lib/profile/settings";
import { isReadmeYearSummaryScreenshot } from "@/lib/demo/readme-screenshot";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/leverage", label: "Plan Leverage", icon: BarChart3 },
  { href: "/projects-breakdown", label: "Projects", icon: FolderKanban },
  { href: "/raw-spend", label: "Spend Logs", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const navLinkClass =
  "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground";

function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isClient = useIsClient();
  const screenshotMode =
    isClient && isReadmeYearSummaryScreenshot(searchParams);
  const { activeHarness, syncing } = useRouteSync();

  const showIndexing =
    isClient &&
    syncing &&
    (activeHarness === "claude" || activeHarness === "all");

  if (screenshotMode) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background">
        <main className="mx-auto flex w-full max-w-5xl flex-1 px-8 py-10">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-background" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-70 dark:opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.72 0.12 45 / 12%), transparent),
            radial-gradient(ellipse 60% 40% at 100% 0%, oklch(0.75 0.08 250 / 8%), transparent),
            radial-gradient(ellipse 50% 30% at 0% 100%, oklch(0.72 0.1 55 / 6%), transparent)
          `,
        }}
      />

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/raw-spend"
              className="text-base font-semibold tracking-tight transition-opacity hover:opacity-80"
            >
              Agentic Usage
            </Link>
            <HarnessSelect />
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      navLinkClass,
                      active && "bg-muted/80 text-foreground",
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {showIndexing ? (
              <div
                className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
                aria-live="polite"
              >
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                Indexing…
              </div>
            ) : null}
            <div className="flex items-center gap-2 sm:hidden">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
                      active && "bg-muted/80 text-foreground",
                    )}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:py-14">
        <CursorSetupBannerGate />
        {children}
      </main>
    </div>
  );
}

export function AppShell({
  children,
  initialActiveHarness = "claude",
}: {
  children: React.ReactNode;
  initialActiveHarness?: ActiveHarness;
}) {
  return (
    <TooltipProvider>
      <RouteSyncProvider initialActiveHarness={initialActiveHarness}>
        <ProjectSyncProvider>
          <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <AppShellFrame>{children}</AppShellFrame>
          </Suspense>
          <Toaster richColors closeButton />
        </ProjectSyncProvider>
      </RouteSyncProvider>
    </TooltipProvider>
  );
}
