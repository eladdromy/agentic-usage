import { formatPlanLeverageUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PlanSpendCell({
  planUsd,
  extraBilledUsd,
  showBreakdown = true,
  compact = false,
  large = false,
  align = "left",
}: {
  planUsd: number;
  extraBilledUsd: number;
  showBreakdown?: boolean;
  compact?: boolean;
  large?: boolean;
  align?: "left" | "center";
}) {
  const total = planUsd + extraBilledUsd;

  if (total <= 0 && planUsd <= 0 && extraBilledUsd <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const breakdownClass = cn(
    "text-muted-foreground leading-tight",
    compact ? "text-[11px]" : "text-xs",
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 tabular-nums",
        align === "center" ? "items-center" : "items-start",
      )}
    >
      <span className={cn(large && "text-2xl font-semibold tracking-tight")}>
        {formatPlanLeverageUsd(total)}
      </span>
      {showBreakdown && extraBilledUsd > 0 ? (
        <span className={breakdownClass}>
          ({formatPlanLeverageUsd(planUsd)} + {formatPlanLeverageUsd(extraBilledUsd)})
        </span>
      ) : null}
    </div>
  );
}
