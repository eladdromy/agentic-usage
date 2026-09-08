import { queryFirstLocalActivitySecViaComposerHeaders } from "@/lib/cursor/cursor-bubble-index";
import {
  cursorUsageDashboardUrl,
  utcTodayString,
} from "@/lib/cursor/billing-coverage-shared";
import { cursorVscdbExists } from "@/lib/cursor/path";

const CURSOR_USAGE_CSV_EXPORT =
  "https://cursor.com/api/dashboard/export-usage-events-csv";

export type CursorLocalExportSuggestion = {
  from: string;
  to: string;
  exportUrl: string;
  downloadUrl: string;
};

export function secToUtcDay(sec: number): string {
  return new Date(Math.floor(sec) * 1000).toISOString().slice(0, 10);
}

export function utcDayToStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function utcDayToEndMs(day: string): number {
  return Date.parse(`${day}T23:59:59.999Z`);
}

export function cursorUsageCsvDownloadUrl(fromDay: string, toDay: string): string {
  const params = new URLSearchParams({
    startDate: String(utcDayToStartMs(fromDay)),
    endDate: String(utcDayToEndMs(toDay)),
    strategy: "tokens",
  });
  return `${CURSOR_USAGE_CSV_EXPORT}?${params.toString()}`;
}

export function buildCursorExportSuggestion(
  fromDay: string,
  toDay: string = utcTodayString(),
): CursorLocalExportSuggestion {
  return {
    from: fromDay,
    to: toDay,
    exportUrl: cursorUsageDashboardUrl(fromDay, toDay),
    downloadUrl: cursorUsageCsvDownloadUrl(fromDay, toDay),
  };
}

export function resolveLocalCursorExportSuggestion(
  vscdbPath: string,
  toDay: string = utcTodayString(),
): CursorLocalExportSuggestion | null {
  if (!cursorVscdbExists(vscdbPath)) return null;

  try {
    const minSec = queryFirstLocalActivitySecViaComposerHeaders(vscdbPath);
    if (minSec == null) return null;

    const fromDay = secToUtcDay(minSec);
    if (fromDay > toDay) return null;

    return buildCursorExportSuggestion(fromDay, toDay);
  } catch {
    return null;
  }
}
