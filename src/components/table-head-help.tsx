"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function TableHeadHelp({
  label,
  help,
  align = "end",
  ariaLabel,
}: {
  label: string;
  help: ReactNode;
  align?: "start" | "end" | "center";
  ariaLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        align === "end" && "justify-end",
        align === "center" && "justify-center",
      )}
    >
      {label}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground normal-case"
              aria-label={ariaLabel ?? `How ${label} is calculated`}
            />
          }
        >
          <Info size={14} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          {help}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
