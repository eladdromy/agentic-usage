import { HarnessLogo } from "@/components/layout/harness-logo";
import { SectionHeader } from "@/components/page-header";
import { MetricSurface } from "@/components/ui/surface";
import type { HarnessKind } from "@/lib/profile/settings";
import { cn } from "@/lib/utils";

const HARNESS_LABELS: Record<HarnessKind, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
};

export function HarnessSettingsCard({
  harness,
  title,
  description,
  children,
  className,
}: {
  harness: HarnessKind;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MetricSurface className={cn("section-stack", className)}>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80">
          <HarnessLogo harness={harness} className="size-6" />
        </div>
        <SectionHeader
          title={title ?? HARNESS_LABELS[harness]}
          description={description}
        />
      </div>
      {children}
    </MetricSurface>
  );
}
