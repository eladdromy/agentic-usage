import {
  PlanLeverageTableSkeleton,
} from "@/components/leverage/plan-leverage-table";
import {
  PlanLeverageYearSummarySkeleton,
} from "@/components/leverage/plan-leverage-year-summary";
import { ProjectsBreakdownTableSkeleton } from "@/components/projects-breakdown/projects-breakdown-table";
import { RawSpendTableSkeleton } from "@/components/raw-spend/raw-spend-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";

export function RawSpendFiltersSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-9 w-36 rounded-xl" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

export function RawSpendPageContentSkeleton() {
  return (
    <div className="section-stack">
      <RawSpendFiltersSkeleton />
      <RawSpendTableSkeleton />
    </div>
  );
}

export function ProjectsBreakdownToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Skeleton className="h-9 w-full max-w-sm rounded-xl" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-52 rounded-xl" />
      </div>
      <Skeleton className="ml-auto h-4 w-24" />
    </div>
  );
}

export function ProjectsBreakdownPageContentSkeleton() {
  return (
    <div className="section-stack">
      <ProjectsBreakdownToolbarSkeleton />
      <ProjectsBreakdownTableSkeleton />
    </div>
  );
}

export function PlanLeveragePageContentSkeleton() {
  return (
    <div className="section-stack">
      <PlanLeverageYearSummarySkeleton />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <PlanLeverageTableSkeleton />
      </div>
    </div>
  );
}

export function TracingExplorerSkeleton() {
  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Skeleton className="h-9 w-full max-w-sm rounded-xl" />
        <Skeleton className="ml-auto h-4 w-24" />
      </div>
      <Surface className="overflow-hidden">
        <div className="space-y-3 p-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </Surface>
    </div>
  );
}

export function TracingSessionsSkeleton() {
  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Skeleton className="h-9 w-full max-w-sm rounded-xl" />
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="ml-auto h-4 w-24" />
      </div>
      <Surface className="overflow-hidden">
        <div className="space-y-3 p-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </Surface>
    </div>
  );
}

export function SessionTraceSkeleton() {
  return (
    <Surface className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="space-y-3 border-border/60 p-4 lg:border-r last:lg:border-r-0">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function SettingsPageContentSkeleton() {
  return (
    <div className="section-stack">
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-28 rounded-xl" />
        ))}
      </div>
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    </div>
  );
}
