export const README_SCREENSHOT_YEAR_SUMMARY = "year-summary";

export function isReadmeYearSummaryScreenshot(
  searchParams: Pick<URLSearchParams, "get">,
): boolean {
  return searchParams.get("screenshot") === README_SCREENSHOT_YEAR_SUMMARY;
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
