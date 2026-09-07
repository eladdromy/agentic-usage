import { afterEach, describe, expect, it } from "vitest";

import {
  anonymizeProjectFields,
  anonymizeProjectName,
  anonymizeSessionRef,
  isAnonymizeEnabled,
} from "@/lib/demo/anonymize-display";
import { anonymizeRawSpendApiRow } from "@/lib/demo/anonymize-api-payloads";
import type { RawSpendApiRow } from "@/lib/raw-spend-all";
import {
  isReadmeYearSummaryScreenshot,
  readmeScreenshotYear,
} from "@/lib/demo/readme-screenshot";

const baseRow: RawSpendApiRow = {
  id: 1,
  harness: "claude",
  rowKey: "claude-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdAtLabel: "Jan 1, 2026",
  createdAgo: "1d ago",
  sourceLabel: "My Real Project",
  sourceDetail: "/Users/eladd/projects/my-real-project",
  refLabel: "abc12345…",
  model: "claude-sonnet",
  inputTokensLabel: "1",
  cacheWriteLabel: "0",
  cacheReadLabel: "0",
  outputTokensLabel: "1",
  totalTokensLabel: "2",
  billingCostLabel: "$0.01",
  apiEqCostLabel: "$0.02",
  calculatedCostUsd: 0.02,
  sortDateSec: 1,
};

describe("isAnonymizeEnabled", () => {
  afterEach(() => {
    delete process.env.AGENTIC_USAGE_ANONYMIZE;
  });

  it("is off by default", () => {
    expect(isAnonymizeEnabled()).toBe(false);
  });

  it("accepts common truthy values", () => {
    for (const value of ["1", "true", "yes", " TRUE "]) {
      process.env.AGENTIC_USAGE_ANONYMIZE = value;
      expect(isAnonymizeEnabled()).toBe(true);
    }
  });
});

describe("anonymizeProjectName", () => {
  it("is deterministic for the same key", () => {
    expect(anonymizeProjectName("my-project")).toBe(anonymizeProjectName("my-project"));
  });

  it("produces different names for different keys", () => {
    expect(anonymizeProjectName("alpha")).not.toBe(anonymizeProjectName("beta"));
  });
});

describe("anonymizeProjectFields", () => {
  afterEach(() => {
    delete process.env.AGENTIC_USAGE_ANONYMIZE;
  });

  it("returns original fields when anonymization is disabled", () => {
    const result = anonymizeProjectFields(
      "slug",
      "My Real Project",
      "/Users/eladd/projects/my-real-project",
    );
    expect(result).toEqual({
      label: "My Real Project",
      detail: "/Users/eladd/projects/my-real-project",
    });
  });

  it("replaces label and detail when anonymization is enabled", () => {
    process.env.AGENTIC_USAGE_ANONYMIZE = "1";
    const result = anonymizeProjectFields(
      "slug",
      "My Real Project",
      "/Users/eladd/projects/my-real-project",
    );
    expect(result.label).not.toBe("My Real Project");
    expect(result.detail).toMatch(/^\/Users\/demo\/projects\//);
    expect(result.detail).not.toContain("/Users/eladd");
  });
});

describe("anonymizeRawSpendApiRow", () => {
  afterEach(() => {
    delete process.env.AGENTIC_USAGE_ANONYMIZE;
  });

  it("returns the row unchanged when anonymization is disabled", () => {
    const row = anonymizeRawSpendApiRow(baseRow, "slug", "session-123");
    expect(row).toEqual(baseRow);
    expect(row.refLabel).toBe("abc12345…");
  });

  it("anonymizes labels and session refs when enabled", () => {
    process.env.AGENTIC_USAGE_ANONYMIZE = "1";
    const row = anonymizeRawSpendApiRow(baseRow, "slug", "session-123");
    expect(row.sourceLabel).not.toBe(baseRow.sourceLabel);
    expect(row.sourceDetail).toMatch(/^\/Users\/demo\/projects\//);
    expect(row.refLabel).toBe(anonymizeSessionRef("session-123"));
    expect(row.refLabel).not.toBe(baseRow.refLabel);
  });
});

describe("readme screenshot helpers", () => {
  it("detects year-summary screenshot mode", () => {
    expect(
      isReadmeYearSummaryScreenshot(new URLSearchParams("screenshot=year-summary")),
    ).toBe(true);
    expect(isReadmeYearSummaryScreenshot(new URLSearchParams())).toBe(false);
  });

  it("parses screenshot year with fallback", () => {
    expect(readmeScreenshotYear(new URLSearchParams("year=2024"), 2026)).toBe(2024);
    expect(readmeScreenshotYear(new URLSearchParams("year=bad"), 2026)).toBe(2026);
  });
});
