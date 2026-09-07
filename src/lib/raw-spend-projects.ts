import {
  decodeProjectSlugForDisplay,
  projectNameFromSlug,
} from "@/lib/claude/project-slugs";
import { queryDistinctProviderProjectPaths } from "@/lib/cursor/provider-usage-db";
import { queryDistinctRawSpendProjectSlugs } from "@/lib/db/usage-db";
import { formatProjectPathLeaf } from "@/lib/format-project-path";
import type { ActiveHarness } from "@/lib/profile/settings";

export type RawSpendProjectOption = {
  value: string;
  label: string;
  detail?: string | null;
};

function projectOptionsForHarness(harness: "claude" | "cursor"): RawSpendProjectOption[] {
  if (harness === "claude") {
    return queryDistinctRawSpendProjectSlugs()
      .map(({ slug }) => ({
        value: slug,
        label: projectNameFromSlug(slug),
        detail: decodeProjectSlugForDisplay(slug),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return queryDistinctProviderProjectPaths()
    .map(({ path }) => ({
      value: path,
      label: formatProjectPathLeaf(path),
      detail: path.replace(/\\/g, "/"),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function rawSpendProjectOptions(harness: ActiveHarness): RawSpendProjectOption[] {
  if (harness === "all") {
    return [
      ...projectOptionsForHarness("claude"),
      ...projectOptionsForHarness("cursor"),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }

  return projectOptionsForHarness(harness);
}
