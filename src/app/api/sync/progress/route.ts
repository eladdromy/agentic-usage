import { NextResponse } from "next/server";

import { getSpendSyncProgress } from "@/lib/db/usage-db";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getSpendSyncProgress());
}
