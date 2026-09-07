import { NextResponse } from "next/server";

import { buildBillingCoveragePayload } from "@/lib/cursor/billing-coverage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(buildBillingCoveragePayload());
}
