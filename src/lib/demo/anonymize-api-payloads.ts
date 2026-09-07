import {
  anonymizeProjectFields,
  anonymizeProjectPath,
  anonymizeSessionRef,
  isAnonymizeEnabled,
} from "@/lib/demo/anonymize-display";
import type { ProjectBreakdownRow } from "@/lib/projects-breakdown-shared";
import type { RawSpendProjectOption } from "@/lib/raw-spend-projects";
import type { RawSpendApiRow } from "@/lib/raw-spend-all";

export function anonymizeProjectBreakdownRows(
  rows: ProjectBreakdownRow[],
): ProjectBreakdownRow[] {
  if (!isAnonymizeEnabled()) return rows;

  return rows.map((row) => {
    const { label, detail } = anonymizeProjectFields(
      row.projectKey,
      row.label,
      row.detail,
    );
    const anonPath = detail ?? anonymizeProjectPath(row.projectKey);
    return {
      ...row,
      label,
      detail,
      projectKey: anonPath,
      rowKey: `path:${anonPath.toLowerCase()}`,
    };
  });
}

export function anonymizeRawSpendProjectOptions(
  projects: RawSpendProjectOption[],
): RawSpendProjectOption[] {
  if (!isAnonymizeEnabled()) return projects;

  return projects.map((project) => {
    const { label, detail } = anonymizeProjectFields(
      project.value,
      project.label,
      project.detail,
    );
    const anonPath = detail ?? anonymizeProjectPath(project.value);
    return {
      ...project,
      value: anonPath,
      label,
      detail,
    };
  });
}

export function anonymizeRawSpendApiRow(
  row: RawSpendApiRow,
  canonicalKey: string,
  sessionRef?: string,
): Omit<RawSpendApiRow, "calculatedCostUsd" | "sortDateSec"> {
  const { label, detail } = anonymizeProjectFields(
    canonicalKey,
    row.sourceLabel,
    row.sourceDetail,
  );

  const anonymized: Omit<RawSpendApiRow, "calculatedCostUsd" | "sortDateSec"> = {
    ...row,
    sourceLabel: label,
    sourceDetail: detail,
  };

  if (sessionRef && row.refLabel) {
    anonymized.refLabel = anonymizeSessionRef(sessionRef);
  }

  return anonymized;
}
