import type { ActiveHarness } from "@/lib/profile/settings";
import { queryDistinctProviderModels } from "@/lib/cursor/provider-usage-db";
import { queryDistinctRawSpendModels } from "@/lib/db/usage-db";

export type RawSpendModelOption = {
  value: string;
  label: string;
};

function modelOptionsForHarness(harness: "claude" | "cursor"): RawSpendModelOption[] {
  const rows =
    harness === "claude"
      ? queryDistinctRawSpendModels()
      : queryDistinctProviderModels();

  return rows.map(({ model }) => ({
    value: model,
    label: model,
  }));
}

export function rawSpendModelOptions(harness: ActiveHarness): RawSpendModelOption[] {
  if (harness === "all") {
    const seen = new Set<string>();
    const merged = [...modelOptionsForHarness("claude"), ...modelOptionsForHarness("cursor")];
    return merged
      .filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return modelOptionsForHarness(harness);
}
