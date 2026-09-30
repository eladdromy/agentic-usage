import { redirect } from "next/navigation";

/** Trace indexing runs inside the single Claude index step. */
export default function SetupClaudeTracePage() {
  redirect("/setup/claude/sync");
}
