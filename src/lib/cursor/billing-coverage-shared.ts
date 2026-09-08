export type UnmatchedBillingPreviewRow = {
  id: number;
  dateIso: string;
  kind: string;
  model: string;
  cost: string;
  reason: string;
  reasonLabel: string;
};

export type BillingMonthRange = {
  /** YYYY-MM */
  month: string;
  label: string;
  from: string;
  to: string;
  exportUrl: string;
};

export type BillingPeriodRange = {
  /** YYYY-MM */
  month: string;
  from: string;
  to: string;
  /** Human label, e.g. "August 2026" */
  label: string;
  /** True when export window is the full calendar month (1st through last day) */
  isFullMonth: boolean;
  /** Cursor billing dashboard URL with from/to query params */
  exportUrl: string;
};

export type BillingExportAll = {
  from: string;
  to: string;
  exportUrl: string;
};

export type BillingCoveragePayload = {
  costSourceAvailable: boolean;
  needsCsv: boolean;
  csvBounds: { minDateSec: number | null; maxDateSec: number | null };
  csvDays: string[];
  /** First and last calendar day in uploaded CSV */
  dataRange: { from: string; to: string } | null;
  /** Calendar months that have uploaded billing rows */
  uploadedMonths: BillingMonthRange[];
  /** Calendar months in the span with no uploaded rows (through current month) */
  missingMonths: BillingMonthRange[];
  /** Months covered by uploaded CSV (legacy; same months as uploadedMonths with partial bounds) */
  periods: BillingPeriodRange[];
  /** Re-open Cursor dashboard for the full uploaded span */
  exportAll: BillingExportAll | null;
  /** When last CSV day is before today, link to export newer usage */
  extendToToday: BillingExportAll | null;
  imports: {
    filename: string;
    importedAt: string;
    rowsInserted: number;
    rowsSkipped: number;
    /** First calendar day in the uploaded CSV file */
    dateFrom: string | null;
    /** Last calendar day in the uploaded CSV file */
    dateTo: string | null;
  }[];
  projectAttribution: {
    vscdbAvailable: boolean;
    total: number;
    matched: number;
    unmatched: number;
    unmatchedPreview: UnmatchedBillingPreviewRow[];
  };
  /** Billing rows not yet matched to projects/composers (sync still needed) */
  projectSyncPending: number;
};

/** @deprecated Renamed to BillingPeriodRange */
export type BillingGapRange = BillingPeriodRange;

const CURSOR_USAGE_DASHBOARD = "https://cursor.com/dashboard/usage";

export function cursorUsageDashboardUrl(from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  return `${CURSOR_USAGE_DASHBOARD}?${params.toString()}`;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function utcTodayString(): string {
  return utcToday();
}

export function daysBetweenUtcDays(fromDay: string, toDay: string): number {
  const fromMs = Date.parse(`${fromDay}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDay}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** e.g. "today", "yesterday", "5 days ago" — compares calendar UTC days. */
export function formatRelativeUtcDay(
  day: string,
  today: string = utcToday(),
): string {
  const days = daysBetweenUtcDays(day, today);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** First/last calendar day span recorded for one CSV upload. */
export type BillingImportSpan = {
  from: string;
  to: string;
};

/** Short status line for the billing coverage settings button. */
export function summarizeBillingCoverageButton(
  coverage: BillingCoveragePayload,
  today: string = utcToday(),
): string {
  const { missingRanges } = buildBillingCoverageFromImports(coverage.imports, today);

  if (missingRanges.length === 0) return "up to date";

  const missingDays = missingRanges.reduce(
    (sum, range) => sum + daysBetweenUtcDays(range.from, range.to) + 1,
    0,
  );
  return missingDays === 1 ? "1 missing day" : `${missingDays} missing days`;
}

function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** Calendar months (YYYY-MM) touched by a day range, inclusive. */
export function billingMonthsInDayRange(from: string, to: string): string[] {
  const startMonth = monthKey(from);
  const endMonth = monthKey(to);
  return enumerateMonthsInclusive(startMonth, endMonth);
}

function lastDayOfUtcMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function utcMonthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const month1 = Number(month.slice(5, 7));
  const lastDay = lastDayOfUtcMonth(year, month1);
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const month0 = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export { formatMonthLabel as formatBillingMonthLabel };

function formatMonthShortLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const month0 = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthAfterKey(month: string): string {
  let year = Number(month.slice(0, 4));
  let month1 = Number(month.slice(5, 7));
  month1 += 1;
  if (month1 > 12) {
    month1 = 1;
    year += 1;
  }
  return `${year}-${String(month1).padStart(2, "0")}`;
}

function groupConsecutiveMonthKeys(
  sortedMonths: string[],
): Array<{ start: string; end: string }> {
  if (sortedMonths.length === 0) return [];

  const ranges: Array<{ start: string; end: string }> = [];
  let start = sortedMonths[0]!;
  let end = sortedMonths[0]!;

  for (let i = 1; i < sortedMonths.length; i++) {
    const month = sortedMonths[i]!;
    if (month === monthAfterKey(end)) {
      end = month;
      continue;
    }
    ranges.push({ start, end });
    start = month;
    end = month;
  }

  ranges.push({ start, end });
  return ranges;
}

/** e.g. `Nov 2025` or `Nov 2025 → Sep 2026` for consecutive calendar months. */
export function formatBillingMonthSpanLabel(start: string, end: string): string {
  const startLabel = formatMonthShortLabel(start);
  if (start === end) return startLabel;
  return `${startLabel} → ${formatMonthShortLabel(end)}`;
}

/** Collapse consecutive YYYY-MM keys into compact span lines for display. */
export function formatBillingMonthSpanLines(months: string[]): string[] {
  const sorted = [...months].sort();
  return groupConsecutiveMonthKeys(sorted).map(({ start, end }) =>
    formatBillingMonthSpanLabel(start, end),
  );
}

function dayAfter(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function toExportRange(from: string, to: string): BillingExportAll {
  return {
    from,
    to,
    exportUrl: cursorUsageDashboardUrl(from, to),
  };
}

function mergeUploadedExportRanges(
  ranges: BillingExportAll[],
): BillingExportAll[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const merged: BillingExportAll[] = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.from <= dayAfter(current.to)) {
      if (next.to > current.to) {
        current = toExportRange(current.from, next.to);
      }
      continue;
    }
    merged.push(current);
    current = next;
  }

  merged.push(current);
  return merged;
}

export function billingImportRecordsToSpans(
  imports: BillingCoveragePayload["imports"],
): BillingImportSpan[] {
  return imports.flatMap((record) => {
    if (!record.dateFrom || !record.dateTo) return [];
    return [{ from: record.dateFrom, to: record.dateTo }];
  });
}

/** Merge per-CSV upload spans (overlap or touch) into uploaded coverage ranges. */
export function buildUploadedRangesFromImportSpans(
  spans: BillingImportSpan[],
): BillingExportAll[] {
  return mergeUploadedExportRanges(
    spans.map((span) => toExportRange(span.from, span.to)),
  );
}

export function buildBillingCoverageFromImports(
  imports: BillingCoveragePayload["imports"],
  today: string = utcToday(),
): { uploadedRanges: BillingExportAll[]; missingRanges: BillingExportAll[] } {
  const uploadedRanges = buildUploadedRangesFromImportSpans(
    billingImportRecordsToSpans(imports),
  );
  const missingRanges = buildMissingDayRanges(uploadedRanges, today);
  return { uploadedRanges, missingRanges };
}

/** Gaps between merged CSV upload spans and from the last span through today. */
export function buildMissingDayRanges(
  uploadedRanges: BillingExportAll[],
  today: string = utcToday(),
): BillingExportAll[] {
  if (uploadedRanges.length === 0) return [];

  const missing: BillingExportAll[] = [];

  for (let i = 0; i < uploadedRanges.length - 1; i++) {
    const from = dayAfter(uploadedRanges[i]!.to);
    const to = dayBefore(uploadedRanges[i + 1]!.from);
    if (from <= to) {
      missing.push(toExportRange(from, to));
    }
  }

  const last = uploadedRanges[uploadedRanges.length - 1]!;
  if (last.to < today) {
    missing.push(toExportRange(dayAfter(last.to), today));
  }

  return missing;
}

export function formatBillingDayRange(from: string, to: string): string {
  const formatDay = (day: string) => {
    const d = new Date(`${day}T00:00:00.000Z`);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  return from === to ? formatDay(from) : `${formatDay(from)} → ${formatDay(to)}`;
}

function enumerateMonthsInclusive(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let year = Number(fromMonth.slice(0, 4));
  let month = Number(fromMonth.slice(5, 7));
  const endYear = Number(toMonth.slice(0, 4));
  const endMonth = Number(toMonth.slice(5, 7));

  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return out;
}

/** Calendar months that have at least one uploaded billing row. */
export function buildUploadedMonths(csvDays: string[]): BillingMonthRange[] {
  const months = [...new Set(csvDays.map((day) => monthKey(day)))].sort();
  return months.map((month) => {
    const from = `${month}-01`;
    const to = utcMonthEnd(month);
    return {
      month,
      label: formatMonthLabel(month),
      from,
      to,
      exportUrl: cursorUsageDashboardUrl(from, to),
    };
  });
}

/** Calendar months from first upload through today with no billing rows. */
export function buildMissingMonths(
  csvDays: string[],
  today: string = utcToday(),
): BillingMonthRange[] {
  if (csvDays.length === 0) return [];

  const uploaded = [...new Set(csvDays.map((day) => monthKey(day)))].sort();
  const firstMonth = uploaded[0]!;
  const currentMonth = monthKey(today);
  const uploadedSet = new Set(uploaded);

  return enumerateMonthsInclusive(firstMonth, currentMonth)
    .filter((month) => !uploadedSet.has(month))
    .map((month) => {
      const from = `${month}-01`;
      const to = month === currentMonth ? today : utcMonthEnd(month);
      return {
        month,
        label: formatMonthLabel(month),
        from,
        to,
        exportUrl: cursorUsageDashboardUrl(from, to),
      };
    });
}

export function formatBillingMonthRange(month: BillingMonthRange): string {
  return month.label;
}

/** One export period per calendar month present in uploaded CSV data. */
export function buildCsvExportPeriods(
  csvDays: string[],
  today: string = utcToday(),
): BillingPeriodRange[] {
  if (csvDays.length === 0) return [];

  const sortedCsvDays = [...csvDays].sort();
  const firstCsvDay = sortedCsvDays[0]!;
  const firstCsvMonth = monthKey(firstCsvDay);
  const currentMonth = monthKey(today);

  const firstDayByMonth = new Map<string, string>();
  const lastDayByMonth = new Map<string, string>();
  for (const day of sortedCsvDays) {
    const month = monthKey(day);
    if (!firstDayByMonth.has(month)) firstDayByMonth.set(month, day);
    lastDayByMonth.set(month, day);
  }

  const csvMonths = [...new Set(csvDays.map(monthKey))].sort();

  return csvMonths.map((month) => {
    const monthStart = `${month}-01`;
    const monthEnd = utcMonthEnd(month);
    const lastInMonth = lastDayByMonth.get(month) ?? monthEnd;

    const from =
      month === firstCsvMonth
        ? (firstDayByMonth.get(month) ?? monthStart)
        : monthStart;
    const to =
      month === currentMonth
        ? lastInMonth < today
          ? lastInMonth
          : today
        : lastInMonth;
    const isFullMonth = from === monthStart && to === monthEnd;

    return {
      month,
      from,
      to,
      isFullMonth,
      label: formatMonthLabel(month),
      exportUrl: cursorUsageDashboardUrl(from, to),
    };
  });
}
