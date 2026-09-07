export type TimeframePreset = "7d" | "30d" | "all" | "custom";

export type TimeframeSelection = {
  preset: TimeframePreset;
  from?: string;
  to?: string;
};

function formatDateParam(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Default custom range: rolling last 30 days (matches the 30d preset window). */
export function defaultCustomDateRange(): { from: string; to: string } {
  const now = Date.now();
  return {
    from: formatDateParam(new Date(now - 30 * 24 * 60 * 60 * 1000)),
    to: formatDateParam(new Date(now)),
  };
}

export function parseTimeframeFromSearchParams(
  params: URLSearchParams,
): TimeframeSelection {
  const preset = params.get("timeframe");
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  if (preset === "custom") {
    if (!from && !to) {
      const defaults = defaultCustomDateRange();
      return { preset: "custom", from: defaults.from, to: defaults.to };
    }
    return { preset: "custom", from, to };
  }
  if (preset === "7d" || preset === "30d" || preset === "all") {
    return { preset, from, to };
  }
  if (from || to) {
    return { preset: "custom", from, to };
  }
  return { preset: "30d" };
}

export function timeframeToUnixBounds(
  selection: TimeframeSelection,
): { fromSec?: number; toSec?: number } {
  const now = Date.now();
  if (selection.preset === "all") return {};

  if (selection.preset === "custom") {
    const fromSec = selection.from
      ? Math.floor(Date.parse(`${selection.from}T00:00:00.000Z`) / 1000)
      : undefined;
    const toSec = selection.to
      ? Math.floor(Date.parse(`${selection.to}T23:59:59.999Z`) / 1000) + 1
      : undefined;
    return { fromSec, toSec };
  }

  const days = selection.preset === "7d" ? 7 : 30;
  return {
    fromSec: Math.floor((now - days * 24 * 60 * 60 * 1000) / 1000),
    toSec: Math.floor(now / 1000) + 1,
  };
}

export function currentMonthParam(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function priorMonthParam(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1, 1));
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
