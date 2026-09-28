"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SessionTraceSkeleton } from "@/components/layout/page-loading-skeletons";
import { SessionTracePanel } from "@/components/tracing/session-trace-panel";
import { shortSessionId } from "@/lib/format";
import type { TraceSessionDetail } from "@/lib/tracing-shared";

export function SessionTraceView({
  projectKey,
  sessionId,
}: {
  projectKey: string;
  sessionId: string;
}) {
  const searchParams = useSearchParams();
  const harnessParam = searchParams.get("harness");
  const harness = harnessParam === "cursor" ? "cursor" : "claude";

  const [detail, setDetail] = useState<TraceSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/tracing/session?sessionId=${encodeURIComponent(sessionId)}&harness=${harness}`,
        );
        if (!res.ok) throw new Error("Failed to load session trace");
        const json = (await res.json()) as TraceSessionDetail;
        if (!cancelled) setDetail(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, harness]);

  const title =
    detail?.session.sessionName?.trim() ||
    `Session ${shortSessionId(sessionId)}`;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={
          <Link
            href={`/tracing/${encodeURIComponent(projectKey)}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Sessions
          </Link>
        }
        title={title}
        description={
          <span className="font-mono text-xs">{shortSessionId(sessionId)}</span>
        }
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : loading || detail == null ? (
        <SessionTraceSkeleton />
      ) : detail.interactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This session has no indexed interactions.
        </p>
      ) : (
        <SessionTracePanel
          harness={detail.harness}
          sessionId={sessionId}
          interactions={detail.interactions}
        />
      )}
    </div>
  );
}
