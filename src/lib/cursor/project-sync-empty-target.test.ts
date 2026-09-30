import { describe, expect, it } from "vitest";

import { resolveEmptyProjectSyncTarget } from "@/lib/cursor/project-sync-empty-target";

describe("resolveEmptyProjectSyncTarget", () => {
  it("returns toast path for settings modal sync", () => {
    expect(resolveEmptyProjectSyncTarget(true, true)).toEqual({
      kind: "modal_toast",
    });
  });

  it("returns finished snapshot for onboarding inline sync", () => {
    expect(resolveEmptyProjectSyncTarget(false, false)).toEqual({
      kind: "inline_complete",
      snapshot: {
        phase: "done",
        bubbleIndexReady: false,
        months: [],
        status: "done",
        finished: true,
      },
    });
  });
});
