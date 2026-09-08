"use client";

import { useId, useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";

import { CURSOR_BILLING_IMPORTED_EVENT } from "@/components/cursor/cursor-setup-banner-gate";
import { Button } from "@/components/ui/button";
import type { ProviderUsageUploadResult } from "@/lib/cursor/provider-usage-types";
import { assertProviderUsageUploadFile } from "@/lib/cursor/provider-usage-csv";
import { cn } from "@/lib/utils";

export function CursorCsvUploadPanel({
  onUploaded,
  disabled,
  actionsAlign = "end",
}: {
  onUploaded: (result: ProviderUsageUploadResult) => void;
  disabled?: boolean;
  actionsAlign?: "start" | "end";
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneDisabled = uploading || disabled;

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
      window.dispatchEvent(new CustomEvent(CURSOR_BILLING_IMPORTED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label
        htmlFor={zoneDisabled ? undefined : inputId}
        className={cn(
          "block rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/60",
          zoneDisabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/50 hover:bg-muted/30",
        )}
        onDragOver={(e) => {
          if (zoneDisabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (zoneDisabled) return;
          e.preventDefault();
          setDragOver(false);
          void pickFile(e.dataTransfer.files[0] ?? null);
        }}
      >
        <Upload
          size={24}
          className="mx-auto mb-3 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">
          Drag and drop your usage-events export here, or click to browse
        </p>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          disabled={zoneDisabled}
          onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {file ? (
        <p className="truncate font-mono text-sm" title={file.name}>
          Selected: {file.name}
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className={actionsAlign === "end" ? "flex justify-end" : undefined}>
        <Button
          type="button"
          disabled={!file || uploading || disabled}
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
    </div>
  );
}
