"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpendSyncProgress } from "@/lib/db/usage-db";

function fileLabel(fileKey: string): string {
  const parts = fileKey.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || fileKey;
}

function FileStatusIcon({
  status,
}: {
  status: SpendSyncProgress["files"][number]["status"];
}) {
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

export function SpendSyncStatusDialog({
  open,
  syncing,
  onClose,
}: {
  open: boolean;
  syncing: boolean;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState<SpendSyncProgress | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      const response = await fetch("/api/sync/progress");
      if (!response.ok || cancelled) return;
      setProgress((await response.json()) as SpendSyncProgress);
    }

    void load();
    if (!syncing) return () => {
      cancelled = true;
    };

    const id = window.setInterval(() => void load(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, syncing]);

  const phase = progress?.phase ?? "idle";
  const finished = !syncing && phase !== "indexing";
  const files = progress?.files ?? [];
  const title =
    phase === "error"
      ? "Spend indexing stopped"
      : finished
        ? "Spend index ready"
        : files.length > 0
          ? `Indexing log files ${(progress?.filesScanned ?? 0).toLocaleString()} / ${files.length.toLocaleString()}…`
          : "Indexing spend…";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(36rem,85vh)] max-w-lg flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Spend index</DialogTitle>
          <DialogDescription>
            Reads local Claude session logs into the spend database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center gap-3">
            {phase === "error" ? (
              <CircleX size={18} className="text-destructive" aria-hidden="true" />
            ) : finished ? (
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
              <p className="text-sm text-muted-foreground">
                {(progress?.rowsInserted ?? 0).toLocaleString()} new events
              </p>
            </div>
          </div>

          {progress?.error ? (
            <p className="text-sm text-destructive" role="alert">
              {progress.error}
            </p>
          ) : null}

          {files.length > 0 ? (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-live="polite">
              {files.map((file) => (
                <li
                  key={file.fileKey}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 text-sm"
                >
                  <span className="shrink-0">
                    <FileStatusIcon status={file.status} />
                  </span>
                  <span className="min-w-0 truncate">{fileLabel(file.fileKey)}</span>
                  <span className="max-w-[8rem] truncate text-right text-xs tabular-nums text-muted-foreground">
                    {file.status === "done"
                      ? `${file.rowsInserted.toLocaleString()} events`
                      : file.status === "in_progress"
                        ? "Reading…"
                        : "Waiting"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Starting spend index…</p>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0">
          <Button type="button" onClick={onClose}>
            {finished ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
