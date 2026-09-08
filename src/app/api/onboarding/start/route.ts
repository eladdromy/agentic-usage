import { NextResponse } from "next/server";

import { markOnboardingStarted } from "@/lib/onboarding/status";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(markOnboardingStarted());
}
