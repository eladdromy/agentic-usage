import { cn } from "@/lib/utils";
import type { HarnessKind } from "@/lib/profile/settings";

export function HarnessLogo({
  harness,
  className,
}: {
  harness: HarnessKind;
  className?: string;
}) {
  const label = harness === "claude" ? "Claude Code" : "Cursor";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand SVGs from /public/logos
    <img
      src={`/logos/${harness}.svg`}
      alt=""
      aria-hidden="true"
      title={label}
      className={cn(
        "size-5 shrink-0",
        harness === "cursor" && "dark:invert",
        className,
      )}
    />
  );
}

/** Overlapping harness logos — matches the “All harnesses” navbar control. */
export function HarnessStack({
  harnesses,
  className,
  logoClassName,
}: {
  harnesses: HarnessKind[];
  className?: string;
  logoClassName?: string;
}) {
  if (harnesses.length === 0) return null;

  return (
    <div className={cn("flex justify-center", className)}>
      <span className="flex shrink-0 items-center -space-x-1">
        {harnesses.map((harness) => (
          <HarnessLogo
            key={harness}
            harness={harness}
            className={cn("size-4", logoClassName)}
          />
        ))}
      </span>
    </div>
  );
}
