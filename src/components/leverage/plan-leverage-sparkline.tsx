"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from "recharts";

import { tooltipSurfaceClass } from "@/components/ui/tooltip";
import { formatLeverageMultiplier, formatPlanLeverageUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type SparklinePoint = { date: string; apiEqvUsd: number };
type MonthlySparklinePoint = { month: string; value: number };

function fillMonthSparkline(month: string, points: SparklinePoint[]): SparklinePoint[] {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return points;

  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const byDay = new Map(points.map((point) => [point.date, point.apiEqvUsd]));

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    return {
      date,
      apiEqvUsd: byDay.get(date) ?? 0,
    };
  });
}

function formatSparklineTooltipDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function SparklineTooltip({
  active,
  payload,
}: Pick<TooltipContentProps<number, string>, "active" | "payload">) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as SparklinePoint | undefined;
  if (!point) return null;

  return (
    <div className={cn("rounded-md", tooltipSurfaceClass)}>
      <p className="font-medium">{formatSparklineTooltipDate(point.date)}</p>
      <p className="mt-0.5 tabular-nums">
        API eq. {formatPlanLeverageUsd(point.apiEqvUsd)}
      </p>
    </div>
  );
}

function lastFullMonthNumber(year: number, now = new Date()): number {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (year < currentYear) return 12;
  if (year > currentYear) return 0;
  return Math.max(0, currentMonth - 1);
}

function fillYearMonthlySparkline(
  year: number,
  points: MonthlySparklinePoint[],
): MonthlySparklinePoint[] {
  const monthCount = lastFullMonthNumber(year);
  if (monthCount === 0) return [];

  const byMonth = new Map(points.map((point) => [point.month, point.value]));

  return Array.from({ length: monthCount }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return {
      month,
      value: byMonth.get(month) ?? 0,
    };
  });
}

function formatSparklineTooltipMonth(month: string): string {
  const d = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonthlySparklineValue(
  value: number,
  formatKind: "usd" | "leverage",
): string {
  if (formatKind === "leverage") {
    return value > 0 ? formatLeverageMultiplier(value) : "—";
  }
  return formatPlanLeverageUsd(value);
}

function MonthlySparklineTooltip({
  active,
  payload,
  valueLabel,
  formatKind,
}: Pick<TooltipContentProps<number, string>, "active" | "payload"> & {
  valueLabel: string;
  formatKind: "usd" | "leverage";
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as MonthlySparklinePoint | undefined;
  if (!point) return null;

  return (
    <div className={cn("rounded-md", tooltipSurfaceClass)}>
      <p className="font-medium">{formatSparklineTooltipMonth(point.month)}</p>
      <p className="mt-0.5 tabular-nums">
        {valueLabel} {formatMonthlySparklineValue(point.value, formatKind)}
      </p>
    </div>
  );
}

export function PlanLeverageMonthlySparkline({
  year,
  data,
  valueLabel,
  formatKind = "usd",
  className,
}: {
  year: number;
  data: MonthlySparklinePoint[];
  valueLabel: string;
  formatKind?: "usd" | "leverage";
  className?: string;
}) {
  const chartData = fillYearMonthlySparkline(year, data);

  if (chartData.every((point) => point.value === 0)) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }

  return (
    <div className={cn("h-8 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Tooltip
            content={({ active, payload }) => (
              <MonthlySparklineTooltip
                active={active}
                payload={payload}
                valueLabel={valueLabel}
                formatKind={formatKind}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={valueLabel}
            stroke="var(--sparkline)"
            fill="var(--sparkline)"
            fillOpacity={0.28}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlanLeverageSparkline({
  month,
  data,
  className,
}: {
  month: string;
  data: SparklinePoint[];
  className?: string;
}) {
  const chartData = fillMonthSparkline(month, data);

  if (chartData.every((point) => point.apiEqvUsd === 0)) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }

  return (
    <div className={cn("h-10 w-full min-w-[7rem]", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Tooltip
            content={({ active, payload }) => (
              <SparklineTooltip active={active} payload={payload} />
            )}
          />
          <Area
            type="monotone"
            dataKey="apiEqvUsd"
            name="API eq."
            stroke="var(--sparkline)"
            fill="var(--sparkline)"
            fillOpacity={0.28}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
