#!/usr/bin/env bash
# Capture README screenshots with anonymized project names and leak checks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/readme-assets"
PORT="${SCREENSHOT_PORT:-3001}"
BASE="${SCREENSHOT_BASE_URL:-http://localhost:${PORT}}"
PW="npx --yes playwright@1.51.1 screenshot"
DEV_PID=""

FORBIDDEN=(
  "plan-leverage"
  "HarnessApp"
  "harnessAppMVP"
  "SupplementsDirectory"
  "investments"
  "saas-appraisgent"
  "Ideas-Machine"
  "KnowledgeMCP"
  "Scrapers-Exploration"
  "StarterSprint"
  "/Users/eladd"
)

cleanup() {
  if [[ -n "$DEV_PID" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

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

assert_no_leaks() {
  local payload="$1"
  local context="$2"
  local lower
  lower="$(printf '%s' "$payload" | tr '[:upper:]' '[:lower:]')"
  for needle in "${FORBIDDEN[@]}"; do
    if [[ "$lower" == *"$(printf '%s' "$needle" | tr '[:upper:]' '[:lower:]')"* ]]; then
      echo "Leak detected in ${context}: found \"${needle}\"" >&2
      exit 1
    fi
  done
}

verify_api() {
  local endpoint body
  for endpoint in "/api/projects-breakdown" "/api/raw-spend?page=1"; do
    body="$(curl -fsS "${BASE}${endpoint}")"
    assert_no_leaks "$body" "$endpoint"
  done
}

if [[ -z "${SCREENSHOT_BASE_URL:-}" ]]; then
  if [[ "${SCREENSHOT_USE_DEV:-}" == "1" ]] && curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/leverage" | grep -q "200"; then
    echo "Using existing dev server at http://localhost:3000"
    echo "Ensure it was started with AGENTIC_USAGE_ANONYMIZE=1 for anonymized screenshots."
    BASE="http://localhost:3000"
  else
    echo "Building production app for clean screenshots…"
    (
      cd "$ROOT"
      AGENTIC_USAGE_ANONYMIZE=1 npm run build
    ) >/tmp/agentic-usage-screenshots-build.log 2>&1

    echo "Starting production server on port ${PORT}…"
    (
      cd "$ROOT"
      AGENTIC_USAGE_ANONYMIZE=1 npm start -- --port "$PORT"
    ) >/tmp/agentic-usage-screenshots.log 2>&1 &
    DEV_PID=$!
    wait_for_server "$BASE"
  fi
fi

verify_api

rm -rf "$OUT"
mkdir -p "$OUT"

capture() {
  local url="$1"
  local file="$2"
  local viewport="${3:-1440,900}"
  local wait_selector="${4:-}"
  echo "→ $file"
  local extra_args=()
  if [[ -n "$wait_selector" ]]; then
    extra_args+=(--wait-for-selector "$wait_selector")
  fi
  $PW \
    --viewport-size="$viewport" \
    --color-scheme=light \
    --wait-for-timeout=6000 \
    "${extra_args[@]}" \
    "${BASE}${url}" \
    "${OUT}/${file}"
}

capture "/leverage?screenshot=year-summary&year=2026" demo-hero.png 1200,720 "h2:has-text('Summary of 2026')"
capture "/leverage" demo-plan-leverage.png 1440,900 "h1:has-text('Plan Leverage')"
capture "/raw-spend" demo-spend-logs.png 1440,900 "h1:has-text('Spend Logs')"
capture "/projects-breakdown" demo-projects.png 1440,900 "h1:has-text('Projects breakdown')"

echo "Saved verified anonymized screenshots to $OUT"
