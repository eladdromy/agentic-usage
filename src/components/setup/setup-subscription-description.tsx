"use client";

export function setupSubscriptionDescription(
  intro: string,
  detectedPlan: { label: string; monthlyUsd: number } | null,
) {
  if (!detectedPlan) return intro;

  return (
    <>
      {intro}
      <br />
      Auto-detected today: {detectedPlan.label} (${detectedPlan.monthlyUsd}/mo).
    </>
  );
}
