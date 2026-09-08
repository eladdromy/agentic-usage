import { describe, expect, it } from "vitest";

import {
  billingImportRecordsToSpans,
  billingMonthsInDayRange,
  buildBillingCoverageFromImports,
  buildExportAllFromUploadedRanges,
  buildMissingDayRanges,
  buildUploadedRangesFromImportSpans,
  cursorUsageDashboardUrl,
  formatBillingDayRange,
  summarizeBillingCoverageButton,
  type BillingCoveragePayload,
} from "@/lib/cursor/billing-coverage-shared";

describe("billingMonthsInDayRange", () => {
  it("returns a single month for an in-month span", () => {
    expect(billingMonthsInDayRange("2026-09-01", "2026-09-08")).toEqual([
      "2026-09",
    ]);
  });

  it("returns consecutive months across a boundary", () => {
    expect(billingMonthsInDayRange("2026-08-28", "2026-09-02")).toEqual([
      "2026-08",
      "2026-09",
    ]);
  });
});

describe("buildUploadedRangesFromImportSpans", () => {
  it("merges overlapping import spans", () => {
    const ranges = buildUploadedRangesFromImportSpans([
      { from: "2026-08-01", to: "2026-08-15" },
      { from: "2026-08-10", to: "2026-08-31" },
    ]);

    expect(ranges).toEqual([
      {
        from: "2026-08-01",
        to: "2026-08-31",
        exportUrl: cursorUsageDashboardUrl("2026-08-01", "2026-08-31"),
      },
    ]);
  });

  it("merges touching import spans", () => {
    const ranges = buildUploadedRangesFromImportSpans([
      { from: "2026-08-01", to: "2026-08-15" },
      { from: "2026-08-16", to: "2026-08-31" },
    ]);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.from).toBe("2026-08-01");
    expect(ranges[0]?.to).toBe("2026-08-31");
  });

  it("keeps disjoint import spans separate", () => {
    const ranges = buildUploadedRangesFromImportSpans([
      { from: "2026-07-01", to: "2026-07-15" },
      { from: "2026-09-01", to: "2026-09-10" },
    ]);

    expect(ranges).toEqual([
      {
        from: "2026-07-01",
        to: "2026-07-15",
        exportUrl: cursorUsageDashboardUrl("2026-07-01", "2026-07-15"),
      },
      {
        from: "2026-09-01",
        to: "2026-09-10",
        exportUrl: cursorUsageDashboardUrl("2026-09-01", "2026-09-10"),
      },
    ]);
  });
});

describe("buildMissingDayRanges", () => {
  it("finds gaps between disjoint uploaded ranges", () => {
    const missing = buildMissingDayRanges(
      [
        {
          from: "2026-07-01",
          to: "2026-07-15",
          exportUrl: cursorUsageDashboardUrl("2026-07-01", "2026-07-15"),
        },
        {
          from: "2026-09-01",
          to: "2026-09-10",
          exportUrl: cursorUsageDashboardUrl("2026-09-01", "2026-09-10"),
        },
      ],
      "2026-09-10",
    );

    expect(missing).toEqual([
      {
        from: "2026-07-16",
        to: "2026-08-31",
        exportUrl: cursorUsageDashboardUrl("2026-07-16", "2026-08-31"),
      },
    ]);
  });

  it("adds trailing days through today after the last upload", () => {
    const missing = buildMissingDayRanges(
      [
        {
          from: "2026-09-01",
          to: "2026-09-05",
          exportUrl: cursorUsageDashboardUrl("2026-09-01", "2026-09-05"),
        },
      ],
      "2026-09-08",
    );

    expect(missing).toEqual([
      {
        from: "2026-09-06",
        to: "2026-09-08",
        exportUrl: cursorUsageDashboardUrl("2026-09-06", "2026-09-08"),
      },
    ]);
  });

  it("does not treat idle days inside an uploaded span as missing", () => {
    const missing = buildMissingDayRanges(
      [
        {
          from: "2026-09-01",
          to: "2026-09-10",
          exportUrl: cursorUsageDashboardUrl("2026-09-01", "2026-09-10"),
        },
      ],
      "2026-09-10",
    );

    expect(missing).toEqual([]);
  });
});

describe("buildExportAllFromUploadedRanges", () => {
  it("returns the single merged span when uploads are contiguous", () => {
    const uploaded = buildUploadedRangesFromImportSpans([
      { from: "2026-08-01", to: "2026-08-15" },
      { from: "2026-08-16", to: "2026-08-31" },
    ]);

    expect(buildExportAllFromUploadedRanges(uploaded)).toEqual(uploaded[0]!);
  });

  it("returns null when uploads leave gaps between spans", () => {
    const uploaded = buildUploadedRangesFromImportSpans([
      { from: "2026-07-01", to: "2026-07-15" },
      { from: "2026-09-01", to: "2026-09-10" },
    ]);

    expect(
      buildExportAllFromUploadedRanges(uploaded, {
        from: "2026-07-01",
        to: "2026-09-10",
        exportUrl: cursorUsageDashboardUrl("2026-07-01", "2026-09-10"),
      }),
    ).toBeNull();
  });

  it("falls back when there are no uploaded ranges", () => {
    const fallback = {
      from: "2026-01-01",
      to: "2026-01-31",
      exportUrl: cursorUsageDashboardUrl("2026-01-01", "2026-01-31"),
    };

    expect(buildExportAllFromUploadedRanges([], fallback)).toBe(fallback);
  });
});

describe("buildBillingCoverageFromImports", () => {
  it("derives uploaded and missing ranges from import records", () => {
    const imports: BillingCoveragePayload["imports"] = [
      {
        filename: "a.csv",
        importedAt: "2026-09-01T00:00:00.000Z",
        rowsInserted: 10,
        rowsSkipped: 0,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-05",
      },
      {
        filename: "b.csv",
        importedAt: "2026-09-02T00:00:00.000Z",
        rowsInserted: 5,
        rowsSkipped: 0,
        dateFrom: "2026-09-08",
        dateTo: "2026-09-10",
      },
    ];

    const { uploadedRanges, missingRanges } = buildBillingCoverageFromImports(
      imports,
      "2026-09-10",
    );

    expect(uploadedRanges).toHaveLength(2);
    expect(missingRanges).toEqual([
      {
        from: "2026-09-06",
        to: "2026-09-07",
        exportUrl: cursorUsageDashboardUrl("2026-09-06", "2026-09-07"),
      },
    ]);
  });

  it("ignores imports without stored date spans", () => {
    expect(
      billingImportRecordsToSpans([
        {
          filename: "legacy.csv",
          importedAt: "2026-09-01T00:00:00.000Z",
          rowsInserted: 1,
          rowsSkipped: 0,
          dateFrom: null,
          dateTo: null,
        },
      ]),
    ).toEqual([]);
  });
});

describe("summarizeBillingCoverageButton", () => {
  const baseCoverage = {
    costSourceAvailable: true,
    needsCsv: false,
    csvBounds: { minDateSec: null, maxDateSec: null },
    csvDays: [],
    dataRange: null,
    uploadedMonths: [],
    missingMonths: [],
    periods: [],
    exportAll: null,
    extendToToday: null,
    imports: [],
    projectAttribution: {
      vscdbAvailable: true,
      total: 0,
      matched: 0,
      unmatched: 0,
      unmatchedPreview: [],
    },
    projectSyncPending: 0,
  } satisfies BillingCoveragePayload;

  it("reports up to date when there are no missing ranges", () => {
    expect(
      summarizeBillingCoverageButton(
        {
          ...baseCoverage,
          imports: [
            {
              filename: "a.csv",
              importedAt: "2026-09-01T00:00:00.000Z",
              rowsInserted: 1,
              rowsSkipped: 0,
              dateFrom: "2026-09-01",
              dateTo: "2026-09-10",
            },
          ],
        },
        "2026-09-10",
      ),
    ).toBe("up to date");
  });

  it("summarizes missing day counts", () => {
    expect(
      summarizeBillingCoverageButton(
        {
          ...baseCoverage,
          imports: [
            {
              filename: "a.csv",
              importedAt: "2026-09-01T00:00:00.000Z",
              rowsInserted: 1,
              rowsSkipped: 0,
              dateFrom: "2026-09-01",
              dateTo: "2026-09-05",
            },
          ],
        },
        "2026-09-08",
      ),
    ).toBe("3 missing days");
  });
});

describe("formatBillingDayRange", () => {
  it("formats a single day without a separator", () => {
    expect(formatBillingDayRange("2026-09-08", "2026-09-08")).toContain("8");
    expect(formatBillingDayRange("2026-09-08", "2026-09-08")).not.toContain("→");
  });
});
