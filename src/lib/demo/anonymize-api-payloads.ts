import {
  anonymizeProjectFields,
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
    return {
      ...row,
      label,
      detail,
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
    return {
      ...project,
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
  if (!isAnonymizeEnabled()) return row;

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
