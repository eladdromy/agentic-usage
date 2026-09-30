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
import { ProjectSyncMonthList } from "@/components/cursor/project-sync-progress-panel";
import type { ProjectSyncMonthState } from "@/lib/cursor/project-sync-types";

export function ProjectSyncMonthDialog({
  open,
  months,
  finished,
  onClose,
}: {
  open: boolean;
  months: ProjectSyncMonthState[];
  finished: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(36rem,85vh)] max-w-lg flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Matching billing rows</DialogTitle>
          <DialogDescription>
            Each month of the uploaded CSV is matched to a local project.
          </DialogDescription>
        </DialogHeader>

        <ProjectSyncMonthList
          months={months}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto"
        />

        <DialogFooter className="mt-0 shrink-0">
          <Button type="button" onClick={onClose}>
            {finished ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
