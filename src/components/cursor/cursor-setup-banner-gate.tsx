"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { CursorDeferredBanner } from "@/components/cursor/cursor-deferred-banner";
import { useRouteSync } from "@/components/layout/route-sync";

export const CURSOR_BILLING_IMPORTED_EVENT = "cursor-billing-imported";

export function CursorSetupBannerGate() {
  const pathname = usePathname();
  const { syncVersion } = useRouteSync();
  const [showBanner, setShowBanner] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const json = (await res.json()) as { showDeferredCursorBanner?: boolean };
      setShowBanner(json.showDeferredCursorBanner === true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh, syncVersion]);

  useEffect(() => {
    const handleImported = () => {
      void refresh();
    };
    window.addEventListener(CURSOR_BILLING_IMPORTED_EVENT, handleImported);
    return () => {
      window.removeEventListener(CURSOR_BILLING_IMPORTED_EVENT, handleImported);
    };
  }, [refresh]);

  if (!showBanner) return null;

  return (
    <div className="mb-10">
      <CursorDeferredBanner />
    </div>
  );
}
