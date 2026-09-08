import { describe, expect, it } from "vitest";

import {
  buildCursorExportSuggestion,
  cursorUsageCsvDownloadUrl,
  secToUtcDay,
  utcDayToEndMs,
  utcDayToStartMs,
} from "@/lib/cursor/local-export-suggestion";

describe("secToUtcDay", () => {
  it("formats unix seconds as UTC YYYY-MM-DD", () => {
    expect(secToUtcDay(1_704_067_200)).toBe("2024-01-01");
  });
});

describe("utcDayToStartMs / utcDayToEndMs", () => {
  it("uses UTC day start and end-of-day ms for Cursor CSV export", () => {
    expect(utcDayToStartMs("2025-11-30")).toBe(1_764_460_800_000);
    expect(utcDayToEndMs("2026-09-08")).toBe(1_788_911_999_999);
  });
});

describe("cursorUsageCsvDownloadUrl", () => {
  it("builds direct CSV download URL with ms timestamps", () => {
    expect(cursorUsageCsvDownloadUrl("2025-11-30", "2026-09-08")).toBe(
      "https://cursor.com/api/dashboard/export-usage-events-csv?startDate=1764460800000&endDate=1788911999999&strategy=tokens",
    );
  });
});

describe("buildCursorExportSuggestion", () => {
  it("builds dashboard and download URLs from first local day through today", () => {
    expect(buildCursorExportSuggestion("2024-01-01", "2026-09-08")).toEqual({
      from: "2024-01-01",
      to: "2026-09-08",
      exportUrl:
        "https://cursor.com/dashboard/usage?from=2024-01-01&to=2026-09-08",
      downloadUrl:
        "https://cursor.com/api/dashboard/export-usage-events-csv?startDate=1704067200000&endDate=1788911999999&strategy=tokens",
    });
  });
});
