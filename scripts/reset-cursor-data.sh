#!/usr/bin/env bash
#
# Reset the app's Cursor billing data so you can re-upload a CSV and watch the
# full attach/sync flow from scratch.
#
# Deletes ONLY this app's derived data:
#   - cursor-provider-usage.db  (uploaded CSV billing rows)
#   - cursor-bubble-index.db    (our local bubble-timestamp sidecar index)
#   ...plus their SQLite -wal / -shm sidecars.
#
# Never touches:
#   - your real Cursor state.vscdb on the machine
#   - agentic-usage.db  (Claude harness data)
#
# Resets Cursor onboarding flags in settings.json (onboardingCompletedAt,
# onboardingCursor*, planOverrides.cursor). Path overrides and other
# preferences are kept.
#
# The data dir honors AGENTIC_USAGE_DATA_DIR, defaulting to <repo>/.data.
#
# Usage:
#   npm run reset:cursor
#   ./scripts/reset-cursor-data.sh
#   AGENTIC_USAGE_DATA_DIR=/custom/dir ./scripts/reset-cursor-data.sh
#
# Note: stop the dev server first (or restart it after) — a running server keeps
# open handles to these SQLite files, so it would keep using the old data until
# restarted. Empty bubble prep after reset can mark all rows no_local_prompts.
# Playbook: docs/cursor-project-sync-troubleshooting.md

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="${AGENTIC_USAGE_DATA_DIR:-$repo_root/.data}"

if [[ ! -d "$data_dir" ]]; then
  echo "No data dir at: $data_dir — nothing to reset."
  exit 0
fi

targets=(
  "cursor-provider-usage.db"
  "cursor-bubble-index.db"
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

node "$repo_root/scripts/patch-settings-onboarding.mjs" cursor

if [[ "$deleted_any" -eq 0 ]]; then
  echo "Already clean — no Cursor billing data found in $data_dir"
else
  echo ""
  echo "Cursor billing data reset in: $data_dir"
  echo "Kept: agentic-usage.db (and your real Cursor state.vscdb)."
  echo "Restart the dev server (npm run dev), then re-upload a usage-events CSV."
  echo "If Claude indexed data is also empty, you'll return to /setup."
  echo "If sync marks all rows no_local_prompts, see docs/cursor-project-sync-troubleshooting.md"
fi
