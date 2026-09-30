import { isAnonymizeEnabled } from "@/lib/demo/anonymize-display";

export const README_SCREENSHOT_YEAR_SUMMARY = "year-summary";

/** Matches the PNG from Plan leverage → Download summary (export card). */
export const README_SCREENSHOT_SUMMARY_EXPORT = "summary-export";

/** Production screenshot server: anonymize labels and skip onboarding redirect. */
export function isReadmeScreenshotCaptureMode(): boolean {
  if (!isAnonymizeEnabled()) return false;
  const raw = process.env.AGENTIC_USAGE_README_SCREENSHOTS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isReadmeYearSummaryScreenshot(
  searchParams: Pick<URLSearchParams, "get">,
): boolean {
  return searchParams.get("screenshot") === README_SCREENSHOT_YEAR_SUMMARY;
}

export function isReadmeSummaryExportScreenshot(
  searchParams: Pick<URLSearchParams, "get">,
): boolean {
  return searchParams.get("screenshot") === README_SCREENSHOT_SUMMARY_EXPORT;
}

/** Strip app chrome for README hero / leverage summary captures. */
export function isReadmeLeverageScreenshot(
  searchParams: Pick<URLSearchParams, "get">,
): boolean {
  const mode = searchParams.get("screenshot");
  return (
    mode === README_SCREENSHOT_YEAR_SUMMARY ||
    mode === README_SCREENSHOT_SUMMARY_EXPORT
  );
}

export function readmeScreenshotYear(
  searchParams: Pick<URLSearchParams, "get">,
  fallback: number,
): number {
  const raw = searchParams.get("year")?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
