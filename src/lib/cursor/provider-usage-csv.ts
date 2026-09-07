import { createHash } from "crypto";

import {
  PROVIDER_USAGE_CSV_COLUMNS,
  PROVIDER_USAGE_REQUIRED_CSV_COLUMNS,
  type ProviderUsageParsedRow,
} from "./provider-usage-types";

const LEGACY_EXPECTED_HEADER = PROVIDER_USAGE_CSV_COLUMNS.join(",");

const TOKEN_COLUMNS = new Set([
  "Input (w/ Cache Write)",
  "Input (w/o Cache Write)",
  "Cache Read",
  "Output Tokens",
  "Total Tokens",
]);

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let value = "";
      i += 1;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          value += line[i];
          i += 1;
        }
      }
      fields.push(value);
      if (line[i] === ",") i += 1;
    } else {
      const comma = line.indexOf(",", i);
      if (comma === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
  return fields;
}

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

function rowHashFromValues(values: string[]): string {
  return createHash("sha256").update(values.join("\x1f")).digest("hex");
}

export function looksLikeProviderUsageCsvHeader(firstLine: string): boolean {
  const header = firstLine.trim().replace(/^\uFEFF/, "");
  if (header === LEGACY_EXPECTED_HEADER || header.startsWith("Date,")) {
    return true;
  }
  const cols = parseCsvLine(header);
  return PROVIDER_USAGE_REQUIRED_CSV_COLUMNS.every((col) => cols.includes(col));
}

export function isProviderUsageFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".csv") || lower.includes("usage-events");
}

/** Client-side guard before upload; accepts Cursor downloads without a .csv suffix. */
export async function assertProviderUsageUploadFile(file: File): Promise<void> {
  if (isProviderUsageFilename(file.name)) return;

  const preview = await file.slice(0, 2048).text();
  const firstLine = preview.split(/\r?\n/)[0] ?? "";
  if (looksLikeProviderUsageCsvHeader(firstLine)) return;

  throw new Error(
    "Select a Cursor usage-events CSV export (expected Date, Kind, Model, … header).",
  );
}

type HeaderMap = Record<string, number>;

function buildHeaderMap(headers: string[]): HeaderMap {
  const map: HeaderMap = {};
  for (let i = 0; i < headers.length; i++) {
    map[headers[i]!.trim()] = i;
  }
  return map;
}

function validateHeaders(headers: string[]): void {
  const missing = PROVIDER_USAGE_REQUIRED_CSV_COLUMNS.filter(
    (col) => !headers.includes(col),
  );
  if (missing.length > 0) {
    throw new Error(
      `Unexpected CSV header — missing required columns: ${missing.join(", ")}`,
    );
  }
}

function field(map: HeaderMap, cols: string[], name: string): string {
  const idx = map[name];
  if (idx == null) return "";
  return cols[idx] ?? "";
}

function mapRow(cols: string[], map: HeaderMap): ProviderUsageParsedRow {
  const date = field(map, cols, "Date");
  const dateSec = Date.parse(date);
  if (!date || Number.isNaN(dateSec)) {
    throw new Error(`Invalid Date value: ${date || "(empty)"}`);
  }

  const hashColumns: string[] = [...PROVIDER_USAGE_CSV_COLUMNS];
  if (map.Project != null && !hashColumns.includes("Project")) {
    hashColumns.splice(3, 0, "Project");
  }

  const displayValues = hashColumns.map((col) => {
    if (TOKEN_COLUMNS.has(col)) {
      const n = parseOptionalInt(field(map, cols, col));
      return n === null ? "" : String(n);
    }
    return field(map, cols, col);
  });

  return {
    date,
    cloudAgentId: field(map, cols, "Cloud Agent ID"),
    automationId: field(map, cols, "Automation ID"),
    kind: field(map, cols, "Kind"),
    model: field(map, cols, "Model"),
    maxMode: field(map, cols, "Max Mode"),
    project: field(map, cols, "Project"),
    composerId: "",
    inputWithCacheWrite: parseOptionalInt(
      field(map, cols, "Input (w/ Cache Write)"),
    ),
    inputWithoutCacheWrite: parseOptionalInt(
      field(map, cols, "Input (w/o Cache Write)"),
    ),
    cacheRead: parseOptionalInt(field(map, cols, "Cache Read")),
    outputTokens: parseOptionalInt(field(map, cols, "Output Tokens")),
    totalTokens: parseOptionalInt(field(map, cols, "Total Tokens")),
    cost: field(map, cols, "Cost"),
    rowHash: rowHashFromValues(displayValues),
  };
}

export function parseProviderUsageCsv(text: string): ProviderUsageParsedRow[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    throw new Error("CSV file is empty");
  }

  const lines = normalized.split("\n");
  const headerLine = lines[0]?.trim().replace(/^\uFEFF/, "");
  if (!headerLine) {
    throw new Error("CSV file is missing a header row");
  }

  const headers = parseCsvLine(headerLine).map((h) => h.trim());
  validateHeaders(headers);
  const headerMap = buildHeaderMap(headers);

  const rows: ProviderUsageParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (fields.length !== headers.length) {
      throw new Error(
        `Line ${i + 1}: expected ${headers.length} columns, got ${fields.length}`,
      );
    }
    rows.push(mapRow(fields, headerMap));
  }

  if (rows.length === 0) {
    throw new Error("CSV has no data rows");
  }

  return rows;
}

export function providerUsageRowToDisplay(row: {
  dateIso: string;
  cloudAgentId: string;
  automationId: string;
  kind: string;
  model: string;
  maxMode: string;
  project: string;
  inputWithCacheWrite: number | null;
  inputWithoutCacheWrite: number | null;
  cacheRead: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: string;
}): Record<string, string> {
  const fmtInt = (n: number | null) => (n === null ? "" : String(n));
  const out: Record<string, string> = {
    Date: row.dateIso,
    "Cloud Agent ID": row.cloudAgentId,
    "Automation ID": row.automationId,
    Kind: row.kind,
    Model: row.model,
    "Max Mode": row.maxMode,
    "Input (w/ Cache Write)": fmtInt(row.inputWithCacheWrite),
    "Input (w/o Cache Write)": fmtInt(row.inputWithoutCacheWrite),
    "Cache Read": fmtInt(row.cacheRead),
    "Output Tokens": fmtInt(row.outputTokens),
    "Total Tokens": fmtInt(row.totalTokens),
    Cost: row.cost,
  };
  if (row.project) out.Project = row.project;
  return out;
}
