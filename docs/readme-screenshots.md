# README screenshots

**Scope:** How demo PNGs in `readme-assets/` are captured and verified without leaking local project names.

**Key source files:** `scripts/capture-readme-screenshots.sh`, `scripts/verify-no-leaks.mjs`, `scripts/readme-leak-strings.json`, `src/lib/demo/anonymize-display.ts`, `src/lib/demo/anonymize-api-payloads.ts`, `src/lib/demo/readme-screenshot.ts`

**Related docs:** [architecture.md](./architecture.md) · [tracing.md](./tracing.md) · [../README.md](../README.md)

---

## Workflow

1. Set `AGENTIC_USAGE_ANONYMIZE=1` and `AGENTIC_USAGE_README_SCREENSHOTS=1` (the capture script sets both) so API responses replace project labels and the app layout skips the onboarding redirect during capture.
2. Run `npm run screenshots` — by default this builds production, starts a server on port 3001, verifies no forbidden strings appear in APIs or rendered pages, captures seven PNGs, and verifies again.
3. Commit updated files under `readme-assets/` (demo PNGs only — `icon.png` is preserved).

## Commands

Regenerate demo images (builds a production server with anonymization, scans APIs and rendered pages for leaks, then captures PNGs):

```bash
npm run screenshots
```

| Command | Purpose |
|---------|---------|
| `npm run screenshots` | Full capture pipeline |
| `npm run screenshots:verify` | Leak scan only (requires running server; set `SCREENSHOT_BASE_URL`) |

Verify leak checks against a running server:

```bash
SCREENSHOT_BASE_URL=http://localhost:3001 npm run screenshots:verify
```

Override the traced project/session used for tracing screenshots (must exist in your local trace index):

```bash
TRACE_SCREENSHOT_PROJECT_SLUG='-Users-you-…-my-app' \
TRACE_SCREENSHOT_SESSION='uuid-here' \
npm run screenshots
```

## Anonymization behavior

When `AGENTIC_USAGE_ANONYMIZE=1`:

- **Anonymized in API JSON (display):** `label`, `detail`, `sourceLabel`, `sourceDetail`, session/composer ref labels; **projects breakdown** `projectKey` and `rowKey`; tracing project names/paths/slugs; free-text in trace request payloads (scrubbed for home paths and forbidden tokens).
- **Harness logos (screenshot only):** single-harness rows in project-style tables use a deterministic ~70% Claude / ~30% Cursor logo mix; dual-harness rows keep both logos (Claude first).
- **Still real (so filters and queries work):** Spend Logs project filter **`value`** on `/api/raw-spend/projects` (only `label` / `detail` are faked there); internal DB keys and query parameters used for filtering. Leak verification for that route checks display fields only.

Nothing in SQLite or on-disk indexes is rewritten — anonymization applies only to HTTP responses while the env var is set.

## Captured files

| File | Route |
|------|--------|
| `demo-hero.png` | `/leverage?screenshot=summary-export&year=2026` |
| `demo-plan-leverage.png` | `/leverage` |
| `demo-projects.png` | `/projects-breakdown` |
| `demo-spend-logs.png` | `/raw-spend` |
| `demo-tracing.png` | `/tracing` |
| `demo-tracing-sessions.png` | `/tracing/{project}` |
| `demo-tracing-session.png` | `/tracing/{project}/{session}?harness=claude` |

## Hero screenshot mode

`/leverage?screenshot=summary-export&year=2026` strips the app chrome and renders the same **Download summary** export card (`PlanLeverageSummaryExportCard`) used for the leverage PNG download. Used for `demo-hero.png`.

Legacy `screenshot=year-summary` still renders the in-page year summary card (`layout="hero"`) if needed.

## Leak checks

`scripts/verify-no-leaks.mjs` scans:

- API routes: `/api/projects-breakdown`, `/api/raw-spend?page=1`, `/api/raw-spend/projects`, `/api/tracing/projects`, `/api/tracing/sessions?…`
- Rendered pages: hero leverage view, Plan Leverage, Spend Logs, Projects breakdown, Tracing explorer, tracing sessions list, session trace view

Forbidden strings live in `scripts/readme-leak-strings.json` (also imported by `src/lib/demo/readme-leak-strings.ts` for trace payload scrubbing). Extend the list when adding new sensitive tokens.

## Dev server shortcut

```bash
AGENTIC_USAGE_ANONYMIZE=1 npm run dev
SCREENSHOT_USE_DEV=1 npm run screenshots
```

Without anonymization on the dev server, the script fails unless `SCREENSHOT_FORCE_DEV=1` is set (not recommended).
