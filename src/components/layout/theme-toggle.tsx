"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useIsClient } from "@/lib/use-is-client";

export function ThemeToggle() {
  const isClient = useIsClient();
  const { resolvedTheme, setTheme } = useTheme();

  if (!isClient) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground"
      >
        <Sun className="size-4" aria-hidden="true" />
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative rounded-xl"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun
        className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
        aria-hidden="true"
      />
      <Moon
        className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
        aria-hidden="true"
      />
    </Button>
  );
}
