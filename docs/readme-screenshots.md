# README screenshots

**Scope:** How demo PNGs in `readme-assets/` are captured and verified without leaking local project names.

**Key source files:** `scripts/capture-readme-screenshots.sh`, `scripts/verify-no-leaks.mjs`, `src/lib/demo/anonymize-display.ts`, `src/lib/demo/anonymize-api-payloads.ts`, `src/lib/demo/readme-screenshot.ts`

**Related docs:** [architecture.md](./architecture.md) · [../README.md](../README.md)

---

## Workflow

1. Set `AGENTIC_USAGE_ANONYMIZE=1` so API responses replace project labels and paths with deterministic fake names.
2. Run `npm run screenshots` — by default this builds production, starts a server on port 3001, verifies no forbidden strings appear in APIs or rendered pages, captures four PNGs, and verifies again.
3. Commit updated files under `readme-assets/`.

## Commands

Regenerate demo images (builds a production server with anonymization, scans APIs and rendered pages for leaks, then captures four PNGs):

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

## Anonymization behavior

When `AGENTIC_USAGE_ANONYMIZE=1`:

- **Anonymized:** `label`, `detail`, `sourceLabel`, `sourceDetail`, and session/composer ref labels in API JSON.
- **Not anonymized:** filter `value` keys (project slugs/paths), `projectKey`, and database queries — so Spend Logs project filters keep working during capture sessions.

## Hero screenshot mode

`/leverage?screenshot=year-summary&year=2026` strips the app chrome and renders only the year summary card (`layout="hero"`). Used for `demo-hero.png`.

## Leak checks

`scripts/verify-no-leaks.mjs` scans:

- API routes: `/api/projects-breakdown`, `/api/raw-spend?page=1`, `/api/raw-spend/projects`
- Rendered pages: hero leverage view, Plan Leverage, Spend Logs, Projects breakdown

Forbidden strings are listed in the script (local project names, home paths, etc.). Extend the list when adding new sensitive tokens.

## Dev server shortcut

```bash
AGENTIC_USAGE_ANONYMIZE=1 npm run dev
SCREENSHOT_USE_DEV=1 npm run screenshots
```

Without anonymization on the dev server, the script fails unless `SCREENSHOT_FORCE_DEV=1` is set (not recommended).
