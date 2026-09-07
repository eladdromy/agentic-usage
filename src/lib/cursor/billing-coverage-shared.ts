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

function monthKey(day: string): string {
  return day.slice(0, 7);
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

/** Contiguous calendar-day spans present in uploaded CSV data. */
export function buildUploadedDayRanges(days: string[]): BillingExportAll[] {
  if (days.length === 0) return [];

  const sorted = [...days].sort();
  const ranges: BillingExportAll[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const day = sorted[i]!;
    if (day !== dayAfter(prev)) {
      ranges.push(toExportRange(start, prev));
      start = day;
    }
    prev = day;
  }

  ranges.push(toExportRange(start, prev));
  return ranges;
}

/** Gaps between uploaded spans and from the last span through today. */
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
  return from === to ? from : `${from} → ${to}`;
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
