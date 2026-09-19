"use client";

import { LoaderCircle } from "lucide-react";

import type {
  TraceContentPart,
  TraceRequestBreakdown,
} from "@/lib/tracing-shared";
import { cn } from "@/lib/utils";

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CodeBlock({ children, error }: { children: string; error?: boolean }) {
  if (!children.trim()) return null;
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words",
        error && "border-destructive/40 text-destructive",
      )}
    >
      {children}
    </pre>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function PartView({ part }: { part: TraceContentPart }) {
  if (part.kind === "text") {
    return (
      <div className="space-y-1.5">
        <SectionLabel>Text</SectionLabel>
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {part.value}
        </p>
      </div>
    );
  }

  if (part.kind === "thinking") {
    return (
      <div className="space-y-1.5">
        <SectionLabel>Thinking</SectionLabel>
        {typeof part.value === "string" ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground italic">
            {part.value}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Encrypted thinking block{part.value.signature ? " (signed)" : ""}.
          </p>
        )}
      </div>
    );
  }

  if (part.kind === "tool_use") {
    return (
      <div className="space-y-1.5">
        <SectionLabel>{`Tool · ${part.name}`}</SectionLabel>
        <CodeBlock>{stringifyValue(part.input)}</CodeBlock>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <SectionLabel>{part.isError ? "Tool result (error)" : "Tool result"}</SectionLabel>
      <CodeBlock error={part.isError}>{stringifyValue(part.content)}</CodeBlock>
    </div>
  );
}

export function RequestBreakdownColumn({
  breakdown,
  loading,
}: {
  breakdown: TraceRequestBreakdown | null;
  loading: boolean;
}) {
  const metaParts: string[] = [];
  if (breakdown) {
    metaParts.push(breakdown.role);
    if (breakdown.model) metaParts.push(breakdown.model);
    if (breakdown.contextPct != null) metaParts.push(`context ${breakdown.contextPct}%`);
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-sm font-medium">Request breakdown</p>
        <p className="truncate text-xs text-muted-foreground">
          {breakdown ? metaParts.join(" · ") : "Select a request"}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Loading breakdown…
          </div>
        ) : !breakdown ? (
          <p className="text-sm text-muted-foreground">
            Select a request to see its full breakdown.
          </p>
        ) : breakdown.content.length === 0 ? (
          <p className="text-sm text-muted-foreground">No content for this request.</p>
        ) : (
          <>
            {breakdown.content.map((part, index) => (
              <PartView key={index} part={part} />
            ))}
            {breakdown.attachedContext && breakdown.attachedContext.length > 0 ? (
              <div className="space-y-2 border-t border-border/60 pt-4">
                <SectionLabel>Attached context</SectionLabel>
                <ul className="space-y-1 text-sm">
                  {breakdown.attachedContext.map((entry, index) => (
                    <li key={`${entry.category}-${index}`} className="truncate">
                      <span className="text-muted-foreground">{entry.category}: </span>
                      {entry.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
