#!/usr/bin/env bash
# Capture README screenshots with anonymized project names and leak checks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/readme-assets"
PORT="${SCREENSHOT_PORT:-3001}"
BASE="${SCREENSHOT_BASE_URL:-http://localhost:${PORT}}"
PW="npx --yes playwright@1.51.1 screenshot"
DEV_PID=""

TRACE_PROJECT_SLUG="${TRACE_SCREENSHOT_PROJECT_SLUG:-"-Users-eladd-General-Code-Work-OS"}"
TRACE_SESSION_ID="${TRACE_SCREENSHOT_SESSION:-dbb4af73-dcf9-40ff-a7d8-93bb2adc9cb4}"
TRACE_PROJECT_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" -- "$TRACE_PROJECT_SLUG")"
TRACE_SESSION_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" -- "$TRACE_SESSION_ID")"

cleanup() {
  if [[ -n "$DEV_PID" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

if command -v lsof >/dev/null 2>&1; then
  stale_pids="$(lsof -t -i :"${PORT}" 2>/dev/null || true)"
  if [[ -n "$stale_pids" ]]; then
    echo "Stopping existing process on port ${PORT}…"
    kill $stale_pids 2>/dev/null || true
    sleep 1
  fi
fi

wait_for_server() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null -w "%{http_code}" "$url/leverage" | grep -q "200"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

verify_no_leaks() {
  SCREENSHOT_BASE_URL="$BASE" \
    TRACE_SCREENSHOT_PROJECT_SLUG="$TRACE_PROJECT_SLUG" \
    TRACE_SCREENSHOT_SESSION="$TRACE_SESSION_ID" \
    node "$ROOT/scripts/verify-no-leaks.mjs"
}

if [[ -z "${SCREENSHOT_BASE_URL:-}" ]]; then
  if [[ "${SCREENSHOT_USE_DEV:-}" == "1" ]] && curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/leverage" | grep -q "200"; then
    echo "Using existing dev server at http://localhost:3000"
    BASE="http://localhost:3000"
    if [[ "${SCREENSHOT_FORCE_DEV:-}" != "1" ]]; then
      if ! SCREENSHOT_BASE_URL="$BASE" TRACE_SCREENSHOT_PROJECT_SLUG="$TRACE_PROJECT_SLUG" TRACE_SCREENSHOT_SESSION="$TRACE_SESSION_ID" node "$ROOT/scripts/verify-no-leaks.mjs"; then
        echo "Dev server failed leak checks (likely missing AGENTIC_USAGE_ANONYMIZE=1)." >&2
        echo "Restart with AGENTIC_USAGE_ANONYMIZE=1 or set SCREENSHOT_FORCE_DEV=1 to override." >&2
        exit 1
      fi
    else
      echo "SCREENSHOT_FORCE_DEV=1 — skipping dev-server anonymization check."
    fi
  else
    echo "Building production app for clean screenshots…"
    (
      cd "$ROOT"
      AGENTIC_USAGE_ANONYMIZE=1 AGENTIC_USAGE_README_SCREENSHOTS=1 npm run build
    ) >/tmp/agentic-usage-screenshots-build.log 2>&1

    echo "Starting production server on port ${PORT}…"
    (
      cd "$ROOT"
      AGENTIC_USAGE_ANONYMIZE=1 AGENTIC_USAGE_README_SCREENSHOTS=1 npm start -- --port "$PORT"
    ) >/tmp/agentic-usage-screenshots.log 2>&1 &
    DEV_PID=$!
    wait_for_server "$BASE"
  fi
fi

verify_no_leaks

mkdir -p "$OUT"
rm -f "$OUT"/demo-*.png

capture() {
  local url="$1"
  local file="$2"
  local viewport="${3:-1440,900}"
  local wait_selector="${4:-}"
  local wait_timeout="${5:-6000}"
  echo "→ $file"
  local extra_args=()
  if [[ -n "$wait_selector" ]]; then
    extra_args+=(--wait-for-selector "$wait_selector")
  fi
  $PW \
    --viewport-size="$viewport" \
    --color-scheme=light \
    --wait-for-timeout="$wait_timeout" \
    "${extra_args[@]}" \
    "${BASE}${url}" \
    "${OUT}/${file}"
}

capture "/leverage?screenshot=summary-export&year=2026" demo-hero.png 960,800 "[data-readme-screenshot=summary-export]"
capture "/leverage" demo-plan-leverage.png 1440,900 "h1:has-text('Plan Leverage')"
capture "/raw-spend" demo-spend-logs.png 1440,900 "h1:has-text('Spend Logs')"
capture "/projects-breakdown" demo-projects.png 1440,900 "h1:has-text('Projects breakdown')"
capture "/tracing" demo-tracing.png 1440,900 "h1:has-text('Tracing')"
capture "/tracing/${TRACE_PROJECT_ENC}" demo-tracing-sessions.png 1440,900 "h1:has-text('Sessions')"
capture "/tracing/${TRACE_PROJECT_ENC}/${TRACE_SESSION_ENC}?harness=claude" demo-tracing-session.png 1600,920 "p:has-text('Request breakdown')" 10000

verify_no_leaks

echo "Saved verified anonymized screenshots to $OUT"
