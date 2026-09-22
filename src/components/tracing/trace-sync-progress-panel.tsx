"use client";

import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import type {
  TraceSyncProjectState,
  TraceSyncSnapshot,
} from "@/components/tracing/trace-sync-provider";

function ProjectStatusIcon({ status }: { status: TraceSyncProjectState["status"] }) {
  if (status === "done") {
    return (
      <CircleCheck
        size={14}
        className="text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
    );
  }
  if (status === "in_progress") {
    return (
      <LoaderCircle
        size={14}
        className="animate-spin text-muted-foreground"
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="inline-block size-3.5 rounded-full border border-border/80"
      aria-hidden="true"
    />
  );
}

export function TraceSyncProgressPanel({
  snapshot,
  embedded = false,
}: {
  snapshot: TraceSyncSnapshot;
  /** Skip the card chrome when the panel sits inside a dialog. */
  embedded?: boolean;
}) {
  const { phase, projects, totalChangedFiles, indexedFiles } = snapshot;

  const title =
    phase === "planning"
      ? "Scanning local session logs…"
      : phase === "error"
        ? "Trace indexing finished with errors"
        : phase === "done"
          ? "Trace index up to date"
          : `Parsing sessions ${indexedFiles.toLocaleString()} / ${totalChangedFiles.toLocaleString()}…`;

  const subtitle =
    phase === "planning"
      ? "Counting sessions to index (Cursor can take ~20s the first time). Parsing runs in small batches afterward."
      : phase === "done"
        ? totalChangedFiles === 0
          ? "No new or changed sessions needed indexing."
          : `Indexed ${indexedFiles.toLocaleString()} of ${totalChangedFiles.toLocaleString()} changed sessions.`
        : phase === "error"
          ? "Indexing stopped before every changed session was parsed."
          : "Indexing in small batches. The counter should tick every few seconds.";

  const body = (
    <>
      <div className="flex shrink-0 items-center gap-3">
        {phase === "error" ? (
          <CircleX size={18} className="text-destructive" aria-hidden="true" />
        ) : phase === "done" ? (
          <CircleCheck
            size={18}
            className="text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <LoaderCircle
            size={18}
            className="animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {snapshot.error ? (
        <p className="text-sm text-destructive" role="alert">
          {snapshot.error}
        </p>
      ) : null}

      {projects.length > 0 ? (
        <ul
          className={
            embedded
              ? "min-h-0 flex-1 space-y-2 overflow-y-auto"
              : "space-y-2"
          }
          aria-live="polite"
        >
          {projects.map((project) => (
            <li
              key={`${project.harness}-${project.projectKey}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 text-sm"
            >
              <span className="shrink-0">
                <ProjectStatusIcon status={project.status} />
              </span>
              <span className="min-w-0 truncate">{project.projectName}</span>
              <span className="max-w-[8rem] truncate text-right text-xs tabular-nums text-muted-foreground">
                {project.status === "done"
                  ? `${project.sessionsIndexed.toLocaleString()} indexed`
                  : `${project.changedFiles.toLocaleString()} sessions`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col gap-4">{body}</div>;
  }

  return <Surface className="space-y-4 p-5">{body}</Surface>;
}
