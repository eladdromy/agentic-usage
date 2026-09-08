"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { ProjectSyncModal } from "@/components/cursor/project-sync-modal";
import {
  fetchProjectSyncMonths,
  runProjectSyncByMonth,
  type ProjectSyncJobSnapshot,
} from "@/lib/cursor/project-sync-client";
import {
  monthNeedsProjectSync,
  resolveProjectSyncTargetMonths,
  rowsToMatchForMonth,
} from "@/lib/cursor/project-sync-target-months";
import type {
  ProjectSyncMonthState,
} from "@/lib/cursor/project-sync-types";

export type StartProjectSyncOptions = {
  months?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  retryUnmatched?: boolean;
  onlyPending?: boolean;
  uploadSummary?: string;
  /** When false, progress is only exposed via syncSnapshot (CSV wizard step 2). */
  modal?: boolean;
  onComplete?: () => void;
};

type ProjectSyncContextValue = {
  startProjectSync: (options?: StartProjectSyncOptions) => Promise<void>;
  syncing: boolean;
  syncSnapshot: ProjectSyncJobSnapshot | null;
};

const ProjectSyncContext = createContext<ProjectSyncContextValue | null>(null);

function buildInitialMonthsState(
  targetMonths: string[],
  payload: Awaited<ReturnType<typeof fetchProjectSyncMonths>>,
  options: StartProjectSyncOptions,
): ProjectSyncMonthState[] {
  return targetMonths.map((month) => {
    const info = payload.months.find((row) => row.month === month)!;
    const shouldRun = monthNeedsProjectSync(info, options);

    return {
      ...info,
      status: shouldRun ? ("pending" as const) : ("skipped" as const),
      rowsToMatch: shouldRun ? rowsToMatchForMonth(info, options) : 0,
    };
  });
}

function initialSnapshot(
  months: ProjectSyncMonthState[],
  bubbleIndexReady: boolean,
): ProjectSyncJobSnapshot {
  return {
    phase: "preparing",
    preparingStep: bubbleIndexReady ? "workspace_scan" : "bubble_index",
    bubbleIndexReady,
    months,
    status: "running",
    finished: false,
  };
}

export function ProjectSyncProvider({ children }: { children: ReactNode }) {
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  const [syncSnapshot, setSyncSnapshot] = useState<ProjectSyncJobSnapshot | null>(null);
  const activeRun = useRef<Promise<void> | null>(null);

  const startProjectSync = useCallback((options: StartProjectSyncOptions = {}) => {
    if (activeRun.current) return activeRun.current;

    activeRun.current = (async () => {
      setSyncing(true);
      setUploadSummary(options.uploadSummary ?? null);

      const useModal = options.modal !== false;

      if (useModal) {
        setModalOpen(true);
        setSyncSnapshot({
          phase: "preparing",
          bubbleIndexReady: true,
          months: [],
          status: "running",
          finished: false,
        });
      }

      try {
        const payload = await fetchProjectSyncMonths();
        const targetMonths = resolveProjectSyncTargetMonths(options, payload.months);

        if (targetMonths.length === 0) {
          toast.info("All billing rows are already linked to projects.");
          if (useModal) {
            setModalOpen(false);
            setSyncSnapshot(null);
          }
          return;
        }

        let monthsState = buildInitialMonthsState(targetMonths, payload, options);
        const hasWork = monthsState.some((month) => month.status === "pending");

        if (!hasWork) {
          if (useModal) {
            setSyncSnapshot({
              phase: "done",
              bubbleIndexReady: payload.bubbleIndexReady,
              months: monthsState,
              status: "done",
              finished: true,
            });
            setModalOpen(true);
          }
          options.onComplete?.();
          return;
        }

        const startingSnapshot = initialSnapshot(monthsState, payload.bubbleIndexReady);
        setSyncSnapshot(startingSnapshot);
        if (useModal) {
          setModalOpen(true);
        }

        await runProjectSyncByMonth({
          months: targetMonths,
          dateFrom: options.dateFrom,
          dateTo: options.dateTo,
          onlyPending: options.onlyPending !== false,
          retryUnmatched: options.retryUnmatched === true,
          onJobChange: (snapshot) => {
            monthsState = snapshot.months;
            setSyncSnapshot(snapshot);
          },
        });

        options.onComplete?.();
      } catch (error) {
        setSyncSnapshot((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                finished: true,
                error: error instanceof Error ? error.message : "Project sync failed",
              }
            : {
                phase: "done",
                bubbleIndexReady: true,
                months: [],
                status: "error",
                finished: true,
                error: error instanceof Error ? error.message : "Project sync failed",
              },
        );
        if (options.modal !== false) {
          setModalOpen(true);
        }
        throw error;
      } finally {
        setSyncing(false);
        activeRun.current = null;
      }
    })();

    return activeRun.current;
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setUploadSummary(null);
    setSyncSnapshot(null);
  }, []);

  const value = useMemo(
    () => ({ startProjectSync, syncing, syncSnapshot }),
    [startProjectSync, syncing, syncSnapshot],
  );

  return (
    <ProjectSyncContext.Provider value={value}>
      {children}
      <ProjectSyncModal
        open={modalOpen}
        snapshot={syncSnapshot}
        uploadSummary={uploadSummary}
        onClose={handleModalClose}
      />
    </ProjectSyncContext.Provider>
  );
}

export function useProjectSync(): ProjectSyncContextValue {
  const ctx = useContext(ProjectSyncContext);
  if (!ctx) {
    throw new Error("useProjectSync must be used within ProjectSyncProvider");
  }
  return ctx;
}
