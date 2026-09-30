#!/usr/bin/env bash
#
# Reset Claude spend, Cursor billing, and both trace indexes so onboarding
# starts over.
#
# Deletes ONLY this app's derived data:
#   - agentic-usage.db
#   - cursor-provider-usage.db
#   - cursor-bubble-index.db
#   - claude-trace.db
#   - cursor-trace.db
#   ...plus their SQLite -wal / -shm sidecars.
#
# Never touches your real Claude JSONL logs or Cursor state.vscdb.
#
# Clears onboarding flags in settings.json, including
# onboardingClaudeTraceIndexed and traceMode, so the mode step is shown again.
# Path overrides are kept.
#
# Usage:
#   npm run reset:all
#   ./scripts/reset-all-data.sh
#   AGENTIC_USAGE_DATA_DIR=/custom/dir ./scripts/reset-all-data.sh
#
# Restart the dev server after — it holds open SQLite handles.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="${AGENTIC_USAGE_DATA_DIR:-$repo_root/.data}"

if [[ ! -d "$data_dir" ]]; then
  echo "No data dir at: $data_dir — nothing to reset."
  exit 0
fi

targets=(
  "agentic-usage.db"
  "cursor-provider-usage.db"
  "cursor-bubble-index.db"
  "claude-trace.db"
  "cursor-trace.db"
)

deleted_any=0
for name in "${targets[@]}"; do
  for path in "$data_dir/$name" "$data_dir/$name-wal" "$data_dir/$name-shm"; do
    if [[ -e "$path" ]]; then
      rm -f "$path"
      echo "deleted $(basename "$path")"
      deleted_any=1
    fi
  done
done

node "$repo_root/scripts/patch-settings-onboarding.mjs" all

echo ""
if [[ "$deleted_any" -eq 0 ]]; then
  echo "Already clean — no indexed databases in $data_dir"
else
  echo "Claude, Cursor, and trace data reset in: $data_dir"
fi
echo "Kept: your real Claude logs and Cursor state.vscdb. Path overrides in settings.json stay."
echo "Restart the dev server (npm run dev), then open the app to run onboarding again."
echo "If Cursor sync marks all rows no_local_prompts, see docs/cursor-project-sync-troubleshooting.md"
