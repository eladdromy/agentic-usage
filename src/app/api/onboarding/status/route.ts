import { NextResponse } from "next/server";

import { buildOnboardingStatus } from "@/lib/onboarding/status";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(buildOnboardingStatus());
}
