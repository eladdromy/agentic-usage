import { APP_ICON_PATH, APP_NAME, APP_REPO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function AgenticUsageAttribution({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-end gap-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <p className="flex items-center gap-1.5">
        generated via
        <span className="inline-flex items-center gap-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- export capture + brand asset */}
          <img
            src={APP_ICON_PATH}
            alt=""
            aria-hidden="true"
            className="size-3.5 rounded-[3px]"
          />
          <span className="font-medium text-foreground">{APP_NAME}</span>
        </span>
      </p>
      <p className="text-[10px] leading-tight text-blue-600">{APP_REPO_URL}</p>
    </div>
  );
}
