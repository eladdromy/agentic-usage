"use client";

import { useCallback, useEffect, useState } from "react";

import { InteractionColumn } from "@/components/tracing/interaction-column";
import { RequestColumn } from "@/components/tracing/request-column";
import { RequestBreakdownColumn } from "@/components/tracing/request-breakdown-column";
import type {
  TraceInteractionSummary,
  TraceRequestBreakdown,
  TraceTimelinePart,
} from "@/lib/tracing-shared";

export function SessionTracePanel({
  harness,
  sessionId,
  interactions,
}: {
  harness: "claude" | "cursor";
  sessionId: string;
  interactions: TraceInteractionSummary[];
}) {
  const [selectedInteraction, setSelectedInteraction] = useState<number | null>(
    interactions[0]?.idx ?? null,
  );
  const [parts, setParts] = useState<TraceTimelinePart[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<TraceRequestBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // Load the request timeline whenever the selected interaction changes.
  useEffect(() => {
    if (selectedInteraction == null) return;
    let cancelled = false;

    async function run() {
      setTimelineLoading(true);
      setParts([]);
      setSelectedTimelineId(null);
      setSelectedRequestId(null);
      setBreakdown(null);
      try {
        const res = await fetch(
          `/api/tracing/requests?sessionId=${encodeURIComponent(sessionId)}&harness=${harness}&interaction=${selectedInteraction}`,
        );
        const json = res.ok
          ? ((await res.json()) as { items: TraceTimelinePart[] })
          : { items: [] };
        if (cancelled) return;
        setParts(json.items);
        const first = json.items[0] ?? null;
        setSelectedTimelineId(first?.timelineId ?? null);
        setSelectedRequestId(first?.requestId ?? null);
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, harness, selectedInteraction]);

  // Load the breakdown whenever the selected request changes.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (selectedRequestId == null) {
        setBreakdown(null);
        return;
      }
      setBreakdownLoading(true);
      try {
        const res = await fetch(
          `/api/tracing/request?requestId=${selectedRequestId}&harness=${harness}`,
        );
        const json = res.ok ? ((await res.json()) as TraceRequestBreakdown) : null;
        if (!cancelled) setBreakdown(json);
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedRequestId, harness]);

  const handleSelectRequest = useCallback((part: TraceTimelinePart) => {
    setSelectedTimelineId(part.timelineId);
    setSelectedRequestId(part.requestId);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm">
      <div className="grid min-h-0 gap-0 lg:grid-cols-3 lg:[height:min(78vh,calc(100vh-16rem))]">
        <InteractionColumn
          harness={harness}
          interactions={interactions}
          selectedIdx={selectedInteraction}
          onSelect={setSelectedInteraction}
        />
        <RequestColumn
          harness={harness}
          parts={parts}
          loading={timelineLoading}
          interactionIdx={selectedInteraction}
          selectedTimelineId={selectedTimelineId}
          onSelect={handleSelectRequest}
        />
        <RequestBreakdownColumn breakdown={breakdown} loading={breakdownLoading} />
      </div>
    </div>
  );
}
