import type { LucideIcon } from "lucide-react";
import { ChevronRight, LoaderCircle } from "lucide-react";

import { SectionHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MetricSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export const settingsCompactFieldClass = "w-56 max-w-full shrink-0";

export const settingsSelectTriggerClass =
  "w-56 max-w-full rounded-xl border-border/60 bg-card/80";

export function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MetricSurface className={cn("section-stack", className)}>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80">
          <Icon size={20} aria-hidden="true" className="text-muted-foreground" />
        </div>
        <SectionHeader title={title} description={description} />
      </div>
      {children}
    </MetricSurface>
  );
}

export function SettingsInfoList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "flex w-fit flex-wrap items-start gap-x-8 gap-y-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function SettingsInfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-md space-y-1", className)}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed">{value}</dd>
    </div>
  );
}

export function SettingsBlockTitle({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function SettingsGroupLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-medium tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SettingsSubsection({
  title,
  description,
  children,
  className,
  divider = true,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-4",
        divider && "border-t border-border/60 pt-6",
        className,
      )}
    >
      {title ? (
        <SettingsBlockTitle title={title} description={description} />
      ) : null}
      {children}
    </div>
  );
}

export function SettingsActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

export function SettingsStatusButton({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  className,
  loading = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  loading?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-auto min-w-[11rem] max-w-xs items-start gap-2 py-2.5 text-left whitespace-normal",
        className,
      )}
    >
      {loading ? (
        <LoaderCircle
          size={16}
          className="mt-0.5 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug">{title}</span>
        <span className="text-xs font-normal leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight
        size={16}
        className="mt-0.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Button>
  );
}

export function SettingsFieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-fit max-w-3xl flex-wrap items-start gap-x-8 gap-y-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsHelpText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "max-w-prose text-sm leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SettingsList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn("space-y-2 text-sm", className)}>{children}</ul>;
}

export function SettingsListItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2",
        className,
      )}
    >
      {children}
    </li>
  );
}
