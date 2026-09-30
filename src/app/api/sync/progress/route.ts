import { NextResponse } from "next/server";

import { getSpendSyncProgress } from "@/lib/db/usage-db";

export const runtime = "nodejs";

/** In-process Claude spend sync progress for onboarding “Show status”. Resets on dev-server restart; may show `skipped` when debounce/no-op applies while the DB already has events. */
export function GET() {
  return NextResponse.json(getSpendSyncProgress());
}
