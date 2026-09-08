#!/usr/bin/env bash
#
# Reset the app's Claude indexed data so you can re-sync JSONL logs from scratch.
#
# Deletes ONLY this app's derived data:
#   - agentic-usage.db  (indexed claude_usage_events + sync metadata)
#   ...plus its SQLite -wal / -shm sidecars.
#
# Never touches:
#   - your real Claude JSONL logs under ~/.claude/projects/
#   - cursor-provider-usage.db  (Cursor billing CSV data)
#   - cursor-bubble-index.db    (Cursor bubble sidecar index)
#   - settings.json             (claudeHomeOverride and other preferences)
#
# The data dir honors AGENTIC_USAGE_DATA_DIR, defaulting to <repo>/.data.
#
# Usage:
#   npm run reset:claude
#   ./scripts/reset-claude-data.sh
#   AGENTIC_USAGE_DATA_DIR=/custom/dir ./scripts/reset-claude-data.sh
#
# Note: stop the dev server first (or restart it after) — a running server keeps
# open handles to these SQLite files, so it would keep using the old data until
# restarted.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="${AGENTIC_USAGE_DATA_DIR:-$repo_root/.data}"

if [[ ! -d "$data_dir" ]]; then
  echo "No data dir at: $data_dir — nothing to reset."
  exit 0
fi

targets=(
  "agentic-usage.db"
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

if [[ "$deleted_any" -eq 0 ]]; then
  echo "Already clean — no Claude indexed data found in $data_dir"
else
  echo ""
  echo "Claude indexed data reset in: $data_dir"
  echo "Kept: cursor-provider-usage.db, cursor-bubble-index.db, settings.json (and your real Claude JSONL logs)."
  echo "Restart the dev server (npm run dev), then trigger Re-index from Settings."
fi
