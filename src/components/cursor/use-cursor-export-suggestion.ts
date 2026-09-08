"use client";

import { useEffect, useState } from "react";

import type { CursorLocalExportSuggestion } from "@/lib/cursor/local-export-suggestion";

export type CursorExportSuggestionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; suggestion: CursorLocalExportSuggestion | null };

export function useCursorExportSuggestion(active: boolean): CursorExportSuggestionState {
  const [state, setState] = useState<CursorExportSuggestionState>({ status: "idle" });

  useEffect(() => {
    if (!active) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const res = await fetch("/api/cursor/local-export-suggestion");
        if (!res.ok) {
          if (!cancelled) setState({ status: "ready", suggestion: null });
          return;
        }
        const json = (await res.json()) as {
          suggestion: CursorLocalExportSuggestion | null;
        };
        if (!cancelled) {
          setState({ status: "ready", suggestion: json.suggestion });
        }
      } catch {
        if (!cancelled) setState({ status: "ready", suggestion: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  return state;
}
