"use client";

import { useId, useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";

import { CURSOR_BILLING_IMPORTED_EVENT } from "@/components/cursor/cursor-setup-banner-gate";
import { Button } from "@/components/ui/button";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";
import { assertProviderUsageUploadFile } from "@/lib/cursor/provider-usage-csv";
import { cn } from "@/lib/utils";

export type CursorCsvUploadControls = {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  dragOver: boolean;
  uploading: boolean;
  error: string | null;
  zoneDisabled: boolean;
  setDragOver: (value: boolean) => void;
  pickFile: (next: File | null) => Promise<void>;
  handleUpload: () => Promise<void>;
};

export function useCursorCsvUpload({
  onUploaded,
  disabled,
}: {
  onUploaded: (result: ProviderUsageUploadResult) => void;
  disabled?: boolean;
}): CursorCsvUploadControls {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneDisabled = uploading || Boolean(disabled);

  const pickFile = async (next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
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
      window.dispatchEvent(new CustomEvent(CURSOR_BILLING_IMPORTED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return {
    inputId,
    inputRef,
    file,
    dragOver,
    uploading,
    error,
    zoneDisabled,
    setDragOver,
    pickFile,
    handleUpload,
  };
}

export function CursorCsvUploadDropZone({
  controls,
}: {
  controls: CursorCsvUploadControls;
}) {
  const {
    inputId,
    inputRef,
    file,
    dragOver,
    zoneDisabled,
    setDragOver,
    pickFile,
  } = controls;

  const zoneClassName = cn(
    "relative block rounded-xl border-2 p-8 text-center transition-colors",
    file
      ? "border-solid border-border/60"
      : dragOver
        ? "border-primary border-dashed"
        : "border-dashed border-border/60",
    zoneDisabled
      ? "cursor-not-allowed opacity-60"
      : file
        ? undefined
        : "cursor-pointer hover:border-primary/50 hover:bg-muted/30",
  );

  function handleDragOver(e: React.DragEvent) {
    if (zoneDisabled) return;
    e.preventDefault();
    setDragOver(true);
  }

  function handleDrop(e: React.DragEvent) {
    if (zoneDisabled) return;
    e.preventDefault();
    setDragOver(false);
    void pickFile(e.dataTransfer.files[0] ?? null);
  }

  function clearFile(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void pickFile(null);
  }

  return (
    <div
      className={zoneClassName}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        className="sr-only"
        disabled={zoneDisabled}
        onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
      />

      {file ? (
        <>
          {!zoneDisabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              aria-label="Remove selected file"
              onClick={clearFile}
            >
              <X size={16} aria-hidden="true" />
            </Button>
          ) : null}
          <FileSpreadsheet
            size={24}
            className="mx-auto mb-3 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="truncate px-6 font-mono text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {zoneDisabled ? "Uploading…" : "Drop a different file to replace"}
          </p>
        </>
      ) : (
        <label
          htmlFor={zoneDisabled ? undefined : inputId}
          className={cn("block", zoneDisabled ? "cursor-not-allowed" : "cursor-pointer")}
        >
          <Upload
            size={24}
            className="mx-auto mb-3 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Drag and drop your usage-events export here, or click to browse
          </p>
        </label>
      )}
    </div>
  );
}

export function CursorCsvUploadButton({
  controls,
  actionsAlign = "end",
}: {
  controls: CursorCsvUploadControls;
  actionsAlign?: "start" | "end";
}) {
  const { file, uploading, zoneDisabled, handleUpload } = controls;

  return (
    <div className={actionsAlign === "end" ? "flex justify-end" : undefined}>
      <Button
        type="button"
        disabled={!file || uploading || zoneDisabled}
        onClick={() => void handleUpload()}
      >
        {uploading ? (
          <>
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Uploading…
          </>
        ) : (
          "Upload CSV"
        )}
      </Button>
    </div>
  );
}

export function CursorCsvUploadPanel({
  onUploaded,
  disabled,
  actionsAlign = "end",
}: {
  onUploaded: (result: ProviderUsageUploadResult) => void;
  disabled?: boolean;
  actionsAlign?: "start" | "end";
}) {
  const controls = useCursorCsvUpload({ onUploaded, disabled });

  return (
    <div className="space-y-4">
      <CursorCsvUploadDropZone controls={controls} />

      {controls.error ? (
        <p className="text-sm text-destructive">{controls.error}</p>
      ) : null}

      <CursorCsvUploadButton controls={controls} actionsAlign={actionsAlign} />
    </div>
  );
}
