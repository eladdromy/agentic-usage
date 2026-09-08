"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

export function SetupShell({
  children,
  stepLabel,
}: {
  children: React.ReactNode;
  stepLabel?: string;
}) {
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

      <header className="border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-6">
          <div className="min-w-0">
            <Link
              href="/setup"
              className="text-base font-semibold tracking-tight transition-opacity hover:opacity-80"
            >
              Agentic Usage
            </Link>
            {stepLabel ? (
              <p className="truncate text-xs text-muted-foreground">{stepLabel}</p>
            ) : null}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 md:py-14">
        {children}
      </main>
    </div>
  );
}

export function SetupStepCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-8", className)}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SetupActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-3 pt-2", className)}>
      {children}
    </div>
  );
}
