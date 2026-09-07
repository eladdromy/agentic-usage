"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import type { ActiveHarness } from "@/lib/profile/settings";
import { useIsClient } from "@/lib/use-is-client";

type SyncApiResult = {
  harness?: ActiveHarness;
  rowsInserted?: number;
  filesScanned?: number;
  skipped?: boolean;
  skipReason?: "debounce" | "no_updates" | "csv_only";
  syncMode?: string;
};

type RouteSyncContextValue = {
  syncing: boolean;
  switchingHarness: boolean;
  syncVersion: number;
  activeHarness: ActiveHarness;
  triggerSync: () => Promise<SyncApiResult | null>;
  switchHarness: (nextHarness: ActiveHarness) => Promise<void>;
};

const RouteSyncContext = createContext<RouteSyncContextValue>({
  syncing: false,
  switchingHarness: false,
  syncVersion: 0,
  activeHarness: "claude",
  triggerSync: async () => null,
  switchHarness: async () => {},
});

async function refreshHarness(): Promise<ActiveHarness | null> {
  try {
    const res = await fetch("/api/profile");
    if (!res.ok) return null;
    const json = (await res.json()) as { activeHarness?: ActiveHarness };
    return json.activeHarness ?? null;
  } catch {
    return null;
  }
}

export function RouteSyncProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isClient = useIsClient();
  const [syncing, setSyncing] = useState(false);
  const [switchingHarness, setSwitchingHarness] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const [activeHarness, setActiveHarness] = useState<ActiveHarness>("claude");
  const syncInFlight = useRef<Promise<SyncApiResult | null> | null>(null);

  const runSync = useCallback(async (): Promise<SyncApiResult | null> => {
    if (syncInFlight.current) {
      return syncInFlight.current as Promise<SyncApiResult | null>;
    }

    const task = (async (): Promise<SyncApiResult | null> => {
      setSyncing(true);
      let syncResult: SyncApiResult | null = null;
      try {
        const harness = await refreshHarness();
        if (harness) setActiveHarness(harness);

        if (harness === "cursor") {
          syncResult = { harness: "cursor", skipped: true, skipReason: "csv_only" };
        } else {
          const syncRes = await fetch("/api/sync", { method: "POST" });
          if (syncRes.ok) {
            syncResult = (await syncRes.json()) as SyncApiResult;
          }
        }

        const harnessAfter = await refreshHarness();
        if (harnessAfter) setActiveHarness(harnessAfter);
      } catch {
        // Pages still load from existing DB if sync fails.
      } finally {
        setSyncing(false);
        setSyncVersion((version) => version + 1);
        syncInFlight.current = null;
      }
      return syncResult;
    })();

    syncInFlight.current = task;
    return task;
  }, []);

  const switchHarness = useCallback(
    async (nextHarness: ActiveHarness) => {
      setSwitchingHarness(true);
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeHarness: nextHarness }),
        });
        if (!res.ok) throw new Error("Failed to switch harness");
        setActiveHarness(nextHarness);
        await runSync();
      } finally {
        setSwitchingHarness(false);
      }
    },
    [runSync],
  );

  useEffect(() => {
    if (!isClient) return;
    void runSync();
  }, [isClient, pathname, runSync]);

  return (
    <RouteSyncContext.Provider
      value={{
        syncing,
        switchingHarness,
        syncVersion,
        activeHarness,
        triggerSync: runSync,
        switchHarness,
      }}
    >
      {children}
    </RouteSyncContext.Provider>
  );
}

export function useRouteSync(): RouteSyncContextValue {
  return useContext(RouteSyncContext);
}
