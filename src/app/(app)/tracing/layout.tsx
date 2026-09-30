import { TraceSyncProvider } from "@/components/tracing/trace-sync-provider";

export default function TracingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TraceSyncProvider>{children}</TraceSyncProvider>;
}
