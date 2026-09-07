import { NextResponse } from "next/server";

import { parseProviderUsageCsv } from "@/lib/cursor/provider-usage-csv";
import {
  importProviderUsageRows,
  MAX_UPLOAD_BYTES,
} from "@/lib/cursor/provider-usage-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file field" },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` },
        { status: 400 },
      );
    }

    const text = await file.text();
    const rows = parseProviderUsageCsv(text);
    const result = importProviderUsageRows(rows, file.name);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to import provider usage";
    const status = message.includes("header") || message.includes("empty")
      ? 400
      : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
