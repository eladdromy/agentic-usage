import Link from "next/link";

import { APP_ICON_PATH, APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function AppBrand({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 text-base font-semibold tracking-tight transition-opacity hover:opacity-80",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- brand asset from /public */}
      <img
        src={APP_ICON_PATH}
        alt=""
        aria-hidden="true"
        className="size-6 shrink-0 rounded-md"
      />
      {APP_NAME}
    </Link>
  );
}
