"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import { useProjectSync } from "@/components/cursor/project-sync-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";
import { assertProviderUsageUploadFile } from "@/lib/cursor/provider-usage-csv";

function noNewRowsMessage(result: ProviderUsageUploadResult): string {
  if (result.skipped > 0) {
    return `No new rows — ${result.skipped.toLocaleString()} already imported`;
  }
  return "No billing rows found in file";
}

function formatUploadSummary(result: ProviderUsageUploadResult): string {
  return (
    `Imported ${result.inserted.toLocaleString()} billing rows` +
    (result.skipped > 0
      ? ` (${result.skipped.toLocaleString()} duplicates skipped)`
      : "")
  );
}

export function CursorCsvUploadDialog({
  open,
  onOpenChange,
  onUploaded,
  onSyncComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (result: ProviderUsageUploadResult) => void;
  onSyncComplete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { startProjectSync } = useProjectSync();

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleClose = () => {
    if (uploading) return;
    reset();
    onOpenChange(false);
  };

  const pickFile = async (next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    try {
      await assertProviderUsageUploadFile(next);
      setFile(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid file");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/cursor/provider-usage/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as ProviderUsageUploadResult & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");

      onUploaded(json);

      if (json.inserted === 0) {
        toast.info(noNewRowsMessage(json));
        reset();
        onOpenChange(false);
        return;
      }

      void startProjectSync({
        uploadSummary: formatUploadSummary(json),
        dateFrom: json.dateFrom,
        dateTo: json.dateTo,
        onComplete: onSyncComplete,
      });

      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload usage-events CSV</DialogTitle>
          <DialogDescription>
            Export from your Cursor account billing dashboard. Downloads are
            often named <span className="font-mono">usage-events</span> and may
            not include a <span className="font-mono">.csv</span> extension.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border/60"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Drag and drop your usage-events export here, or
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
            Browse files
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {file ? (
          <p className="truncate font-mono text-sm" title={file.name}>
            Selected: {file.name}
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={uploading} onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!file || uploading} onClick={() => void handleUpload()}>
            {uploading ? (
              <>
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              "Upload"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
