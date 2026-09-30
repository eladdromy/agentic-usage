"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TraceSyncProgressPanel } from "@/components/tracing/trace-sync-progress-panel";
import type { TraceSyncSnapshot } from "@/components/tracing/trace-sync-provider";

export function TraceSyncModal({
  open,
  snapshot,
  onClose,
  dismissible = false,
}: {
  open: boolean;
  snapshot: TraceSyncSnapshot | null;
  onClose: () => void;
  /** When true, the dialog can close while indexing continues. */
  dismissible?: boolean;
}) {
  const finished = snapshot?.phase === "done" || snapshot?.phase === "error";
  const canClose = dismissible || finished;

  return (
    <Dialog
      open={open}
      disablePointerDismissal={!canClose}
      onOpenChange={(next, eventDetails) => {
        if (!next && !canClose) {
          eventDetails.cancel();
          return;
        }
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[min(36rem,85vh)] max-w-lg flex-col overflow-hidden sm:max-w-lg"
        showCloseButton={canClose}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Update trace index</DialogTitle>
          <DialogDescription>
            Indexes new or changed local session logs into the trace database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {snapshot ? (
            <TraceSyncProgressPanel snapshot={snapshot} embedded />
          ) : (
            <p className="text-sm text-muted-foreground">Starting trace index…</p>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0">
          <Button type="button" disabled={!canClose} onClick={onClose}>
            {finished
              ? snapshot?.phase === "error"
                ? "Done — with errors"
                : "Done"
              : dismissible
                ? "Close"
                : "Indexing…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
