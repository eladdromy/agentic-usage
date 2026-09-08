import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { SettingsGroupLabel } from "@/components/settings/settings-ui";

export const settingsDialogContentClass =
  "flex h-[min(32rem,85vh)] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl";

export function SettingsDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={settingsDialogContentClass}>
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border/60 px-4 pt-4 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Scrollable dialog body for single-panel dialogs (project sync, unmatched rows). */
export function SettingsDialogScrollBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto", className)}>
      {children}
    </div>
  );
}

/** Fixed-height scroll region for tab panels inside a dialog. */
export function SettingsDialogTabPanels({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto pt-4", className)}>
      {children}
    </div>
  );
}

export function SettingsDialogSection({
  title,
  description,
  children,
  className,
  divider = true,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  divider?: boolean;
}) {
  return (
    <section
      className={cn(
        "space-y-3",
        divider && "border-t border-border/60 pt-5 first:border-0 first:pt-0",
        className,
      )}
    >
      <div className="space-y-1">
        <SettingsGroupLabel>{title}</SettingsGroupLabel>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsDialogStatStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SettingsDialogAlert({
  children,
  variant = "warning",
  className,
}: {
  children: ReactNode;
  variant?: "warning";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm leading-relaxed",
        variant === "warning" &&
          "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SettingsDialogPlainList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ul className={cn("space-y-1", className)}>{children}</ul>;
}

export function SettingsDialogPlainItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <li className={cn("text-sm leading-relaxed", className)}>{children}</li>;
}

export function SettingsDialogRowList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ul className={cn("space-y-2", className)}>{children}</ul>;
}

export function SettingsDialogRow({
  title,
  detail,
  action,
  className,
}: {
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        {detail ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}
