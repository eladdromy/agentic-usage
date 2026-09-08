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
import { ProjectSyncProgressPanel } from "@/components/cursor/project-sync-progress-panel";
import type { ProjectSyncJobSnapshot } from "@/lib/cursor/project-sync-client";

export function ProjectSyncModal({
  open,
  snapshot,
  uploadSummary,
  onClose,
}: {
  open: boolean;
  snapshot: ProjectSyncJobSnapshot | null;
  uploadSummary: string | null;
  onClose: () => void;
}) {
  const finished = snapshot?.finished ?? false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && finished) onClose();
      }}
    >
      <DialogContent className="max-w-lg" showCloseButton={finished}>
        <DialogHeader>
          <DialogTitle>Link billing to projects</DialogTitle>
          <DialogDescription>
            Matches uploaded billing rows to local Cursor workspace paths.
          </DialogDescription>
        </DialogHeader>

        {snapshot ? (
          <ProjectSyncProgressPanel
            phase={snapshot.phase}
            preparingStep={snapshot.preparingStep}
            months={snapshot.months}
            finished={snapshot.finished}
            bubbleIndexReady={snapshot.bubbleIndexReady}
            uploadSummary={uploadSummary}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Starting project sync…</p>
        )}

        {snapshot?.error && finished ? (
          <p className="text-sm text-destructive">{snapshot.error}</p>
        ) : null}

        {finished ? (
          <DialogFooter className="-mx-4 -mb-4 mt-2 border-t bg-muted/50 p-4">
            <Button type="button" onClick={onClose}>
              {snapshot?.status === "error" ? "Done — with errors" : "Done"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
