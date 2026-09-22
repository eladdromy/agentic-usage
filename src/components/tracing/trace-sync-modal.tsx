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
}: {
  open: boolean;
  snapshot: TraceSyncSnapshot | null;
  onClose: () => void;
}) {
  const finished = snapshot?.phase === "done" || snapshot?.phase === "error";

  return (
    <Dialog
      open={open}
      disablePointerDismissal={!finished}
      onOpenChange={(next, eventDetails) => {
        if (!next && !finished) {
          eventDetails.cancel();
          return;
        }
        if (!next && finished) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[min(36rem,85vh)] max-w-lg flex-col overflow-hidden sm:max-w-lg"
        showCloseButton={finished}
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
          <Button type="button" disabled={!finished} onClick={onClose}>
            {finished
              ? snapshot?.phase === "error"
                ? "Done — with errors"
                : "Done"
              : "Indexing…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
