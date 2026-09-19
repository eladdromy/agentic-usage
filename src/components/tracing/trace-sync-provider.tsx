"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type TraceSyncPhase = "idle" | "planning" | "indexing" | "done" | "error";

export type TraceSyncProjectState = {
  harness: "claude" | "cursor";
  projectKey: string;
  projectName: string;
  changedFiles: number;
  totalFiles: number;
  status: "pending" | "in_progress" | "done";
  sessionsIndexed: number;
};

export type TraceSyncSnapshot = {
  phase: TraceSyncPhase;
  projects: TraceSyncProjectState[];
  totalChangedFiles: number;
  indexedFiles: number;
  /** Set when sync plan is empty because full tracing is off for every in-scope harness. */
  tracingDisabled?: boolean;
  error?: string;
};

type TraceSyncPlanResponse = {
  projects: {
    harness: "claude" | "cursor";
    projectKey: string;
    projectName: string;
    changedFiles: number;
    totalFiles: number;
  }[];
  totalChangedFiles: number;
  indexingEnabled?: boolean;
};

type TraceSyncContextValue = {
  snapshot: TraceSyncSnapshot;
  version: number;
  rerun: () => void;
};

const IDLE: TraceSyncSnapshot = {
  phase: "idle",
  projects: [],
  totalChangedFiles: 0,
  indexedFiles: 0,
};

export async function runTraceSyncChunks(
  onSnapshot: (snapshot: TraceSyncSnapshot) => void,
): Promise<void> {
  onSnapshot({ ...IDLE, phase: "planning" });

  async function fetchPlanScope(harness: "claude" | "cursor" | "all") {
    const res = await fetch(`/api/tracing/sync/plan?harness=${harness}`);
    if (!res.ok) throw new Error("Failed to plan trace sync");
    return (await res.json()) as TraceSyncPlanResponse;
  }

  const settingsRes = await fetch("/api/settings");
  const settings = settingsRes.ok
    ? ((await settingsRes.json()) as {
        activeHarness?: "claude" | "cursor" | "all" | null;
        traceMode?: { claude?: string; cursor?: string };
      })
    : null;
  const activeHarness = settings?.activeHarness ?? "claude";
  const claudeOn = settings?.traceMode?.claude === "full_tracing";
  const cursorOn = settings?.traceMode?.cursor === "full_tracing";
  const wantClaude =
    claudeOn && (activeHarness === "claude" || activeHarness === "all");
  const wantCursor =
    cursorOn && (activeHarness === "cursor" || activeHarness === "all");

  const emptyPlan = {
    projects: [],
    totalChangedFiles: 0,
    indexingEnabled: true,
  } satisfies TraceSyncPlanResponse;

  const claudePlanTask = wantClaude ? fetchPlanScope("claude") : null;
  const cursorPlanTask = wantCursor ? fetchPlanScope("cursor") : null;

  const claudePlan = claudePlanTask ? await claudePlanTask : emptyPlan;
  let cursorPlan: TraceSyncPlanResponse = emptyPlan;
  let cursorPlanReady = !cursorPlanTask;

  const indexingEnabled = (claudePlan.indexingEnabled ?? true) !== false;

  let planProjects = [...claudePlan.projects];
  let totalChangedFiles = claudePlan.totalChangedFiles;

  const toIndex = (): TraceSyncPlanResponse["projects"] =>
    planProjects.filter((p) => p.changedFiles > 0);
  async function ensureCursorPlanMerged(): Promise<void> {
    if (cursorPlanReady || !cursorPlanTask) return;
    cursorPlan = await cursorPlanTask;
    cursorPlanReady = true;
    if ((cursorPlan.indexingEnabled ?? true) === false) {
      return;
    }
    planProjects = [...claudePlan.projects, ...cursorPlan.projects];
    totalChangedFiles =
      claudePlan.totalChangedFiles + cursorPlan.totalChangedFiles;
  }

  if (toIndex().length === 0 && !cursorPlanTask) {
    if (indexingEnabled) {
      await fetch("/api/tracing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalize: true }),
      });
    }
    onSnapshot({
      phase: "done",
      projects: [],
      totalChangedFiles: 0,
      indexedFiles: 0,
      tracingDisabled: indexingEnabled === false,
    });
    return;
  }

  if (toIndex().length === 0 && cursorPlanTask) {
    await ensureCursorPlanMerged();
    if (toIndex().length === 0) {
      if (indexingEnabled) {
        await fetch("/api/tracing/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finalize: true }),
        });
      }
      onSnapshot({
        phase: "done",
        projects: [],
        totalChangedFiles: 0,
        indexedFiles: 0,
        tracingDisabled: indexingEnabled === false,
      });
      return;
    }
  }

  let projectsState: TraceSyncProjectState[] = toIndex().map((p) => ({
    harness: p.harness,
    projectKey: p.projectKey,
    projectName: p.projectName,
    changedFiles: p.changedFiles,
    totalFiles: p.totalFiles,
    status: "pending",
    sessionsIndexed: 0,
  }));
  let indexedFiles = 0;

  onSnapshot({
    phase: "indexing",
    projects: projectsState,
    totalChangedFiles,
    indexedFiles,
  });

  for (let projectIndex = 0; ; projectIndex++) {
    if (projectIndex === projectsState.length) {
      if (!cursorPlanReady && cursorPlanTask) {
        await ensureCursorPlanMerged();
        const pending = toIndex().filter(
          (p) =>
            !projectsState.some(
              (s) => s.projectKey === p.projectKey && s.harness === p.harness,
            ),
        );
        if (pending.length === 0) break;
        projectsState = [
          ...projectsState,
          ...pending.map((p) => ({
            harness: p.harness,
            projectKey: p.projectKey,
            projectName: p.projectName,
            changedFiles: p.changedFiles,
            totalFiles: p.totalFiles,
            status: "pending" as const,
            sessionsIndexed: 0,
          })),
        ];
        continue;
      }
      break;
    }

    const project = {
      harness: projectsState[projectIndex]!.harness,
      projectKey: projectsState[projectIndex]!.projectKey,
      projectName: projectsState[projectIndex]!.projectName,
      changedFiles: projectsState[projectIndex]!.changedFiles,
      totalFiles: projectsState[projectIndex]!.totalFiles,
    };
    projectsState = projectsState.map((p) =>
      p.projectKey === project.projectKey && p.harness === project.harness
        ? { ...p, status: "in_progress" }
        : p,
    );
    onSnapshot({
      phase: "indexing",
      projects: projectsState,
      totalChangedFiles,
      indexedFiles,
    });

    const body =
      project.harness === "cursor"
        ? { harness: "cursor", projectPath: project.projectKey }
        : { harness: "claude", projectSlug: project.projectKey };

    let projectSessionsIndexed = 0;
    let done = false;
    let lastRemaining = Number.POSITIVE_INFINITY;
    let stagnantChunks = 0;
    while (!done) {
      const res = await fetch("/api/tracing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = res.ok
        ? ((await res.json()) as {
            sessionsIndexed?: number;
            remainingChanged?: number;
            done?: boolean;
            changedProcessed?: number;
          })
        : { sessionsIndexed: 0, done: true };

      const chunkIndexed = result.sessionsIndexed ?? 0;
      projectSessionsIndexed += chunkIndexed;
      const remaining = result.remainingChanged ?? 0;
      const changedProcessed = result.changedProcessed ?? chunkIndexed;
      done = result.done === true || remaining === 0;

      if (!done && changedProcessed === 0 && remaining >= lastRemaining) {
        stagnantChunks += 1;
        if (stagnantChunks >= 2) done = true;
      } else {
        stagnantChunks = 0;
      }
      lastRemaining = remaining;

      if (changedProcessed > 0) {
        indexedFiles = Math.min(totalChangedFiles, indexedFiles + changedProcessed);
      }

      onSnapshot({
        phase: "indexing",
        projects: projectsState,
        totalChangedFiles,
        indexedFiles,
      });
    }

    projectsState = projectsState.map((p) =>
      p.projectKey === project.projectKey && p.harness === project.harness
        ? { ...p, status: "done", sessionsIndexed: projectSessionsIndexed }
        : p,
    );
    onSnapshot({
      phase: "indexing",
      projects: projectsState,
      totalChangedFiles,
      indexedFiles,
    });
  }

  await fetch("/api/tracing/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finalize: true }),
  });

  await ensureCursorPlanMerged();

  onSnapshot({
    phase: "done",
    projects: projectsState,
    totalChangedFiles,
    indexedFiles,
  });
}

const TraceSyncContext = createContext<TraceSyncContextValue>({
  snapshot: IDLE,
  version: 0,
  rerun: () => {},
});

export function TraceSyncProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<TraceSyncSnapshot>(IDLE);
  const [version, setVersion] = useState(0);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      await runTraceSyncChunks(setSnapshot);
      setVersion((v) => v + 1);
    } catch (error) {
      setSnapshot((prev) => ({
        ...prev,
        phase: "error",
        error: error instanceof Error ? error.message : "Trace sync failed",
      }));
      setVersion((v) => v + 1);
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const value = useMemo(
    () => ({ snapshot, version, rerun: () => void run() }),
    [snapshot, version, run],
  );

  return (
    <TraceSyncContext.Provider value={value}>
      {children}
    </TraceSyncContext.Provider>
  );
}

export function useTraceSync(): TraceSyncContextValue {
  return useContext(TraceSyncContext);
}
