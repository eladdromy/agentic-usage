import { cn } from "@/lib/utils";

export function Surface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/80 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MetricSurface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm transition-all duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}
