import { useSyncExternalStore } from "react";

/** True only after hydration — server and first client pass both see false. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
