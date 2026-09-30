import { NextResponse } from "next/server";

import {
  anonymizeProjectName,
  anonymizeProjectFields,
  isAnonymizeEnabled,
  readmeScreenshotHarnessLogo,
  readmeScreenshotHarnessesForRow,
} from "@/lib/demo/anonymize-display";
import { deepScrubReadmePayload } from "@/lib/demo/anonymize-api-payloads";
import { ensureSynced } from "@/lib/db/usage-db";
import { queryProjectsBreakdown } from "@/lib/projects-breakdown";
import type { ProjectBreakdownRow } from "@/lib/projects-breakdown-shared";
import { resolveActiveHarness } from "@/lib/profile/settings";

export const runtime = "nodejs";

function anonymizeBreakdownRows(rows: ProjectBreakdownRow[]): ProjectBreakdownRow[] {
  if (!isAnonymizeEnabled()) return rows;

  return rows.map((row) => {
    const canonicalKey = row.projectKey.trim() || row.rowKey.trim() || row.label;
    const { label, detail } = anonymizeProjectFields(
      canonicalKey,
      row.label,
      row.detail,
    );
    const fakeKey = anonymizeProjectName(canonicalKey);
    const logoHarness = readmeScreenshotHarnessLogo(canonicalKey);

    return {
      ...row,
      label,
      detail,
      projectKey: fakeKey,
      rowKey: `${logoHarness}:${fakeKey}`,
      harnesses: readmeScreenshotHarnessesForRow(canonicalKey, row.harnesses),
    };
  });
}

export async function GET() {
  const harness = resolveActiveHarness();

  if (harness === "claude" || harness === "all") {
    await ensureSynced();
  }

  const payload = queryProjectsBreakdown(harness);

  const rows = anonymizeBreakdownRows(payload.rows);

  return NextResponse.json(
    deepScrubReadmePayload({
      ...payload,
      rows,
    }),
  );
}
