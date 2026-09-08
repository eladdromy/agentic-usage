import { describe, expect, it } from "vitest";

import {
  monthNeedsProjectSync,
  resolveProjectSyncTargetMonths,
  rowsToMatchForMonth,
} from "@/lib/cursor/project-sync-target-months";
import type { ProjectSyncMonthInfo } from "@/lib/cursor/project-sync-types";

const month = (
  monthKey: string,
  pendingRows: number,
  unmatchedRows: number,
): ProjectSyncMonthInfo => ({
  month: monthKey,
  label: monthKey,
  totalRows: pendingRows + unmatchedRows,
  pendingRows,
  matchedRows: 0,
  unmatchedRows,
});

describe("resolveProjectSyncTargetMonths", () => {
  const monthInfos = [
    month("2025-12", 0, 0),
    month("2026-01", 5, 0),
    month("2026-02", 0, 2),
  ];

  it("filters upload date span to months that still need work", () => {
    expect(
      resolveProjectSyncTargetMonths(
        { dateFrom: "2025-12-01", dateTo: "2026-02-28" },
        monthInfos,
      ),
    ).toEqual(["2026-01"]);

    expect(
      resolveProjectSyncTargetMonths(
        {
          dateFrom: "2025-12-01",
          dateTo: "2026-02-28",
          retryUnmatched: true,
        },
        monthInfos,
      ),
    ).toEqual(["2026-01", "2026-02"]);
  });

  it("includes unmatched months when retryUnmatched is true", () => {
    expect(
      resolveProjectSyncTargetMonths(
        { dateFrom: "2026-01-01", dateTo: "2026-02-28", retryUnmatched: true },
        monthInfos,
      ),
    ).toEqual(["2026-01", "2026-02"]);
  });

  it("respects an explicit month list", () => {
    expect(
      resolveProjectSyncTargetMonths(
        { months: ["2025-12", "2026-02"] },
        monthInfos,
      ),
    ).toEqual(["2025-12", "2026-02"]);
  });
});

describe("monthNeedsProjectSync", () => {
  it("skips synced months when onlyPending defaults true", () => {
    expect(monthNeedsProjectSync(month("2026-03", 0, 0), {})).toBe(false);
    expect(monthNeedsProjectSync(month("2026-03", 1, 0), {})).toBe(true);
  });

  it("retries unmatched rows only when retryUnmatched is true", () => {
    const info = month("2026-03", 0, 4);
    expect(monthNeedsProjectSync(info, {})).toBe(false);
    expect(monthNeedsProjectSync(info, { retryUnmatched: true })).toBe(true);
  });
});

describe("rowsToMatchForMonth", () => {
  it("counts pending plus unmatched on re-match", () => {
    const info = month("2026-03", 3, 4);
    expect(rowsToMatchForMonth(info, {})).toBe(3);
    expect(rowsToMatchForMonth(info, { retryUnmatched: true })).toBe(7);
  });
});
