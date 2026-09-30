import {
  anonymizeProjectFields,
  anonymizeSessionRef,
  anonymizeProjectName,
  anonymizeProjectPath,
  isAnonymizeEnabled,
  readmeScreenshotHarnessLogo,
  readmeScreenshotHarnessesForRow,
} from "@/lib/demo/anonymize-display";
import { README_LEAK_STRINGS } from "@/lib/demo/readme-leak-strings";
import type { ProjectBreakdownRow } from "@/lib/projects-breakdown-shared";
import type { RawSpendProjectOption } from "@/lib/raw-spend-projects";
import type { RawSpendApiRow } from "@/lib/raw-spend-all";
import type { TraceHarness, TraceProject, TraceSession } from "@/lib/tracing-shared";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubReadmeSensitiveText(text: string): string {
  if (!isAnonymizeEnabled()) return text;

  let out = text.replace(/\/Users\/eladd[^\s"'`<>]*/gi, (match) => {
    const leaf = match.split("/").filter(Boolean).pop() ?? "project";
    return `/Users/demo/projects/${leaf.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
  });

  out = out.replace(/\/users\/eladd[^\s"'`<>]*/gi, (match) =>
    anonymizeProjectPath(match.replace(/^\/users\/eladd/i, "/Users/eladd")),
  );

  out = out.replace(/-Users-eladd[-A-Za-z0-9]*/g, (match) => anonymizeProjectName(match));

  out = out.replace(/\bpath:\/users\/eladd[^\s"'`<>]*/gi, (match) => {
    const fake = anonymizeProjectName(match);
    return `path:${fake}`;
  });

  for (const needle of README_LEAK_STRINGS) {
    out = out.replace(new RegExp(escapeRegExp(needle), "gi"), "[redacted]");
  }

  return out;
}

export function deepScrubReadmePayload<T>(value: T): T {
  if (!isAnonymizeEnabled()) return value;

  if (typeof value === "string") {
    return scrubReadmeSensitiveText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepScrubReadmePayload(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = deepScrubReadmePayload(nested);
    }
    return out as T;
  }

  return value;
}

export function anonymizeProjectBreakdownRows(
  rows: ProjectBreakdownRow[],
): ProjectBreakdownRow[] {
  if (!isAnonymizeEnabled()) return rows;

  return rows.map((row) => {
    const canonicalKey = row.projectKey.trim() || row.rowKey.trim() || row.label;
    const { label, detail } = anonymizeProjectFields(
      canonicalKey,
      row.label,
      row.detail,
    );
    const fakeKey = anonymizeProjectName(canonicalKey);
    const logoHarness = readmeScreenshotHarnessLogo(canonicalKey);
    const {
      rowKey: _rowKey,
      projectKey: _projectKey,
      label: _label,
      detail: _detail,
      harnesses: _harnesses,
      ...rest
    } = row;

    return {
      ...rest,
      label,
      detail,
      projectKey: fakeKey,
      rowKey: `${logoHarness}:${fakeKey}`,
      harnesses: readmeScreenshotHarnessesForRow(canonicalKey, row.harnesses),
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
    harness: readmeScreenshotHarnessLogo(canonicalKey),
  };

  if (sessionRef && row.refLabel) {
    anonymized.refLabel = anonymizeSessionRef(sessionRef);
  }

  return anonymized;
}

export function anonymizeTraceProjects(projects: TraceProject[]): TraceProject[] {
  if (!isAnonymizeEnabled()) return projects;

  return projects.map((project) => {
    const key = project.projectPath.trim() || project.projectSlug;
    const { label, detail } = anonymizeProjectFields(
      key,
      project.projectName,
      project.projectPath,
    );
    const fakeKey = anonymizeProjectName(key);
    return {
      ...project,
      projectSlug: fakeKey,
      projectName: label,
      projectPath: detail ?? project.projectPath,
      harnesses: readmeScreenshotHarnessesForRow(
        key,
        project.harnesses,
      ) as TraceHarness[],
    };
  });
}

export function anonymizeTraceSessionRows(
  rows: TraceSession[],
  projectKey: string,
): TraceSession[] {
  if (!isAnonymizeEnabled()) return rows;

  return rows.map((row) => ({
    ...row,
    harness: readmeScreenshotHarnessLogo(`${projectKey}:${row.sessionId}`),
  }));
}

export function anonymizeTraceSessionResponse<T>(payload: T): T {
  if (!isAnonymizeEnabled()) return payload;

  const scrubbed = deepScrubReadmePayload(payload) as Record<string, unknown>;
  const session = scrubbed.session;
  if (session && typeof session === "object" && session !== null) {
    const s = session as Record<string, unknown>;
    const slug = typeof s.projectSlug === "string" ? s.projectSlug : "";
    const path = typeof s.projectPath === "string" ? s.projectPath : slug;
    const key = path.trim() || slug.trim() || "project";
    const { label, detail } = anonymizeProjectFields(
      key,
      typeof s.projectName === "string" ? s.projectName : path,
      path,
    );
    s.projectName = label;
    s.projectPath = detail ?? path;
    if (slug) s.projectSlug = slug;
  }

  return scrubbed as T;
}

export function anonymizeTraceSessionsMeta(
  projectPath: string,
  projectName: string,
  claudeSlug: string | null,
): { projectPath: string; projectName: string } {
  if (!isAnonymizeEnabled()) {
    return { projectPath, projectName };
  }

  const key = projectPath.trim() || claudeSlug?.trim() || projectName.trim() || "project";
  const { label, detail } = anonymizeProjectFields(key, projectName, projectPath);
  return {
    projectPath: detail ?? projectPath,
    projectName: label,
  };
}
