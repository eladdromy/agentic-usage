# Cursor provider usage CSV

Cursor **usage-events** CSV exports are the sole billing source for the Cursor harness. **API eq.** uses the billed on-demand amount when present; otherwise it shows a token-based estimate (prefixed with `~`).

## Spend columns (Spend Logs)

| Column | Included usage | On-demand |
|--------|----------------|-----------|
| **Spend** | `Included` | `$X` from CSV |
| **API eq.** | `~$X` token estimate | `$X` (same as Spend) |

## CSV schema

Required columns (by header name — Cursor may add optional columns over time):

| Column | Meaning |
|--------|---------|
| `Date` | ISO timestamp when the billed LLM call completed |
| `Kind` | Billing bucket: `Included`, `On-Demand`, … |
| `Model` | Billed model id |
| `Cost` | `Included` or USD for on-demand |
| Token columns | Input, cache read/write, output, total |

Optional:

| Column | Meaning |
|--------|---------|
| `Project` | Repo / workspace path when present in export |

When `Project` is absent in the CSV, project paths are attached **after upload** by scanning local `state.vscdb` **only within the CSV date range** (±60s buffer): user/agent bubbles → composer → workspace path (Agentic_Usage-style attribution). Workspace paths are read from the legacy `ItemTable` `composer.composerHeaders` blob, the newer **`composerHeaders` SQL table**, `composerData:<id>` KV when a session was pruned from headers, **per-workspace `composer.composerData`** (`selectedComposerIds` / `lastFocusedComposerIds`), or **`task_v2` subagent roll-up** to the parent's project. Rows that cannot be matched are listed with a reason.

## Project attribution (CSV-triggered)

```
CSV upload → store billing rows → scan vscdb in CSV date window only
→ match each row → composer → project path → persist project + composer_id columns
→ unmatched rows tracked with reason
```

| Unmatch reason | Meaning |
|----------------|---------|
| `vscdb_not_found` | `state.vscdb` missing or unreadable |
| `no_local_prompts` | No user/agent bubbles in the billing date window |
| `no_composer_match` | No composer matched for the row timestamp |
| `no_project_path` | Composer has no workspace / folder path |

Re-run attribution without re-uploading: `POST /api/cursor/attach-projects` (optionally `?month=YYYY-MM` for one month). `GET /api/cursor/attach-projects` lists per-month pending row counts for the project sync UI.

After CSV upload, project sync runs **in the background** (one month at a time, sequentially). Only billing months touched by the uploaded file’s date span are synced — e.g. a CSV covering 2026-09-08 syncs September only. Progress appears in a bottom-right toast; the Settings project sync dialog is for status inspection only.

Sync uses `POST /api/cursor/attach-projects/sync` (returns **202 immediately**) and polls `GET /api/cursor/attach-projects/sync` for progress — long work no longer holds an HTTP connection open, so navigation stays responsive in dev. `GET` returns `{ status: "idle" }` when no sync is running; completed jobs are not kept on the server.

Per month, sync: loads Cursor `state.vscdb` prompts/bubbles for the **pending rows’ date window** in that month (not the full CSV span), matches each unattached CSV row to a composer → workspace path, and writes `project` / `composer_id` on billing rows. After upload, only **pending rows in the uploaded CSV date span** are processed (not the whole month or prior failures).

Cursor stores bubbles in `cursorDiskKV` with a unique index on `key`. **`LIKE 'bubbleId:%'` forces a full-table scan** (SQLite cannot use the index); this app uses **`key >= 'bubbleId:' AND key < 'bubbleId;'`** plus a local `.data/cursor-bubble-index.db` sidecar (timestamp index) for full-range scans.

**Upload / scoped attach fast path:** when the sidecar index is not ready, attach reads bubble stubs from **`composerData:{composerId}` header metadata** (indexed KV lookups per composer, ~hundreds of rows) instead of scanning every `bubbleId:` row (~90k+). Before the first month runs, background sync **builds the bubble index once** if missing. Workspace folders are always scanned for project paths (cached for the whole sync job).

## Model pricing

Token-based **API eq.** uses rates from [Cursor models & pricing](https://cursor.com/docs/models-and-pricing) (Grok, Composer, Auto) plus third-party API rates (Claude, GPT, Gemini, Kimi, GLM, …). Implementation: `src/lib/pricing/model-pricing.ts`.

| Property | Value |
|----------|-------|
| Storage | `.data/cursor-provider-usage.db` |
| Tables | `provider_usage_events` (`project`, `composer_id`, `project_unmatch_reason`), `provider_usage_imports` (`date_from`, `date_to` per upload) |
| API | `POST /api/cursor/provider-usage/upload`, `POST /api/cursor/attach-projects` (single month), `POST/GET /api/cursor/attach-projects/sync` (background multi-month) |
| Dedup | `row_hash` per CSV row |

Export from Cursor billing dashboard as `usage-events` (often without a `.csv` suffix). Upload accepts any file whose name or header matches the usage-events export.

## Spend Logs & Leverage

Both pages query `provider_usage_events` directly — no full vscdb conversation indexing, no live timestamp join at read time.

- **Spend Logs** — paginated billing rows with stored project (from CSV column or post-upload attach), matched composer id, and API-equivalent cost. Filters: project, model, timeframe (including custom range popover), sort by last request or highest spend.
- **Leverage** — monthly totals and sparklines from CSV dates

`GET /api/cursor/billing-coverage` also returns `projectAttribution` stats and an unmatched-rows preview for the UI.

## Uploaded period & export links

`GET /api/cursor/billing-coverage` derives coverage from CSV uploads and billing rows:

- `dataRange` — first and last calendar day among stored billing rows
- `imports[].dateFrom` / `dateTo` — first and last calendar day in each uploaded CSV file (stored on import; backfilled from rows for existing imports)
- **Settings billing coverage dialog** — merges per-CSV spans (overlap or touch) into uploaded ranges; gaps are only **between** upload spans, plus trailing days after the last upload through today. Idle days inside a CSV span are not treated as missing.
- `uploadedMonths` / `missingMonths` — calendar-month views (used by spend alerts)
- `periods` — one entry per calendar month in the CSV (with Cursor dashboard export URLs)
- `exportAll` — single export link when merged uploads form one contiguous span; `null` when uploads leave gaps (use per-range links from `uploadedRanges` instead)
- `extendToToday` — trailing gap after the last CSV upload through today

## Subscription plan (separate from CSV)

Cursor plan tier auto-detection reads `state.vscdb` → `ItemTable` profile keys only (`cursorAuth/*`, `applicationUser`). See [plan-pricing.md](./plan-pricing.md).

## Key modules

- `src/lib/cursor/provider-usage-csv.ts` — parse + validate header
- `src/lib/cursor/provider-usage-db.ts` — SQLite store + monthly aggregates
- `src/lib/cursor/billing-coverage.ts` — CSV date range + export URLs
- `src/lib/cursor/cursor-subagent-spawn.ts` — `task_v2` child → parent project roll-up
- `src/lib/cursor/billing-project-attach.ts` — post-upload project attach job
- `src/lib/cursor/billing-event-attribution.ts` — bubble → composer matching
- `src/lib/cursor/vscdb-bubbles.ts` — scoped bubble load for billing window
- `src/lib/cursor/project-attribution.ts` — composer → workspace path map
- `src/lib/pricing/cursor-usage-cost.ts` — format/estimate row cost
