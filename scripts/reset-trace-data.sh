#!/usr/bin/env bash
#
# Reset the app's Claude trace index so it can be rebuilt from scratch.
#
# Deletes ONLY this app's derived trace data:
#   - claude-trace.db / cursor-trace.db  (indexed sessions + watermarks)
#   ...plus its SQLite -wal / -shm sidecars.
#
# Never touches:
#   - your real Claude JSONL logs under ~/.claude/projects/
#   - agentic-usage.db          (spend/usage indexing)
#   - cursor-provider-usage.db  (Cursor billing CSV data)
#   - cursor-bubble-index.db    (Cursor bubble sidecar index)
#   - settings.json             (traceMode and other preferences kept)
#
# The data dir honors AGENTIC_USAGE_DATA_DIR, defaulting to <repo>/.data.
#
# Usage:
#   npm run reset:trace
#   ./scripts/reset-trace-data.sh
#   AGENTIC_USAGE_DATA_DIR=/custom/dir ./scripts/reset-trace-data.sh
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

deleted_any=0
for path in \
  "$data_dir/claude-trace.db" \
  "$data_dir/claude-trace.db-wal" \
  "$data_dir/claude-trace.db-shm" \
  "$data_dir/cursor-trace.db" \
  "$data_dir/cursor-trace.db-wal" \
  "$data_dir/cursor-trace.db-shm"; do
  if [[ -e "$path" ]]; then
    rm -f "$path"
    echo "deleted $(basename "$path")"
    deleted_any=1
  fi
done

if [[ "$deleted_any" -eq 0 ]]; then
  echo "Already clean — no trace index found in $data_dir"
else
  echo ""
  echo "Trace indexes reset in: $data_dir"
  echo "Kept: agentic-usage.db, cursor databases, settings.json, and your real logs."
  echo "Restart the dev server (npm run dev), then open Tracing."
  settings_file="$data_dir/settings.json"
  if [[ -f "$settings_file" ]]; then
    if ! grep -q '"full_tracing"' "$settings_file" 2>/dev/null; then
      echo ""
      echo "Note: settings.json has no full_tracing mode saved yet."
      echo "  Settings → Tracing → Full tracing → Save tracing settings (per harness)."
      echo "  Until then, the Tracing page stays empty by design (spend-only default)."
    fi
  fi
fi
