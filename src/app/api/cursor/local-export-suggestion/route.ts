import { NextResponse } from "next/server";

import { resolveLocalCursorExportSuggestion } from "@/lib/cursor/local-export-suggestion";
import { getResolvedVscdbPath } from "@/lib/cursor/path";
import { readSettings } from "@/lib/profile/settings";

export const runtime = "nodejs";

export async function GET() {
  const settings = readSettings();
  const vscdbPath = getResolvedVscdbPath(settings.vscdbPathOverride ?? null);
  const suggestion = resolveLocalCursorExportSuggestion(vscdbPath);

  return NextResponse.json({ suggestion });
}
