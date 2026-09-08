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

Re-run attribution without re-uploading: `POST /api/cursor/attach-projects` (optionally `?month=YYYY-MM` for one month). `GET /api/cursor/attach-projects` lists per-month pending row counts and `bubbleIndexReady` for the project sync UI.

### Upload + project sync UX

CSV upload is a **single-step dialog** (pick file → upload). On success with new rows, the upload dialog closes and an **app-level blocking modal** opens for project linking — the same modal used by **Re-match projects** / **Sync now**. The modal cannot be dismissed (no X, backdrop click, or Escape) until sync finishes; **Done** stays disabled until then.

If the file has **no new rows** (`inserted === 0`), the upload dialog closes and a snackbar explains why (duplicates or empty file). Project sync is skipped.

If **Re-match** / **Sync now** finds no rows to process, a snackbar reports that all billing rows are already linked.

Manual sync (**Re-match projects**, **Sync now**) opens the blocking modal directly (no upload header). The modal is app-level so navigation does not hide in-progress sync. Re-match only lists months with pending or previously **unmatched** rows; prompt loading and subagent indexing are scoped to those rows’ timestamp window (not the full calendar month). Rows that fail again with the same reason skip redundant DB writes.

Progress phases (poll `GET /api/cursor/attach-projects/sync`):

| Field | Values |
|-------|--------|
| `phase` | `preparing` → `syncing` → `done` |
| `preparingStep` | During `preparing`: `bubble_index` (if needed) → `workspace_scan` → `loading_prompts` |
| `bubbleIndexReady` | Snapshot at job start; when `false`, the bubble-index prep step is shown |

During `preparing`, the UI shows prep steps only (not billing months). Prompt loading for the billing date window runs in `loading_prompts`, then the match index is built from those bubbles before the month list appears. During `syncing`, months stay **Up next** until row matching begins; the counter then ticks `1/N`, `2/N`, … per row. **Done** (enabled only when finished) dismisses the modal.

After CSV upload, only billing months touched by the uploaded file’s date span are synced — e.g. a CSV covering 2026-09-08 syncs September only. Within that span, only months with **pending** rows (or **unmatched** rows when `retryUnmatched: true`) are included in the sync job — already-synced months are not listed.

If front-loaded bubble prep finds **no prompts in range** (stale sidecar index after `reset:cursor` without restarting the dev server, empty index, etc.), per-month attach **falls back** to loading bubbles for that batch instead of marking every row `no_local_prompts`.

Sync uses `POST /api/cursor/attach-projects/sync` (returns **202 immediately**) and polls `GET /api/cursor/attach-projects/sync` every 750ms. `GET` returns the **latest job regardless of status** (running _or_ finished), retained until the next sync replaces it, and `{ status: "idle" }` only when no sync has ever run. Retention matters because re-matching known-fail rows can finish in well under one poll interval (e.g. ~160ms for 123 rows) — if the completed job were dropped, the poller would never observe the final per-month result and would hang on stale "Up next" progress. The client stops polling as soon as it reads a non-`running` job (authoritative final matched/unmatched counts) or finds its job superseded.

**Deployment note:** sync job state lives in an in-memory singleton on the Next.js server (`project-sync-background.ts`). This matches the app’s local single-process dev model; it does not survive multiple server instances or cold serverless workers. Run one server process when using background sync.

Settings **Project sync** panel is read-only status inspection (not a sync trigger).

Per month, sync: loads Cursor `state.vscdb` prompts/bubbles for the **pending rows’ date window** in that month (not the full CSV span), matches each unattached CSV row to a composer → workspace path, and writes `project` / `composer_id` on billing rows. After upload, only **pending rows in the uploaded CSV date span** are processed (not the whole month or prior failures).

Cursor stores bubbles in `cursorDiskKV` with a unique index on `key`. **`LIKE 'bubbleId:%'` forces a full-table scan** (SQLite cannot use the index); this app uses **`key >= 'bubbleId:' AND key < 'bubbleId;'`** plus a local `.data/cursor-bubble-index.db` sidecar (timestamp index) for full-range scans.

**Upload / scoped attach fast path:** when the sidecar index is not ready, attach reads bubble stubs from **`composerData:{composerId}` header metadata** (indexed KV lookups per composer, ~hundreds of rows) instead of scanning every `bubbleId:` row (~90k+). Before the first month runs, background sync **builds the bubble index once** if missing (`phase: preparing`), yielding to the event loop every 500 rows. Workspace folders are always scanned for project paths (cached for the whole sync job).

### Where the work actually happens (prep vs per-month)

The expensive work is **global and one-time**, so `preparing` does it once and every month reuses the result. This is why months flip to **done** almost instantly once the month list appears — the per-month step is a cheap lookup + DB write, not a fetch.

| Built once in `preparing` | Passed to every month's attach |
|---------------------------|-------------------------------|
| Bubble index (`ensureCursorBubbleIndexSyncAsync`) — full ~90k-row scan, only when `bubbleIndexReady: false` | (index used implicitly by bubble loads) |
| `composerProjects` (`loadComposerProjectMapAsync`, all workspaces) | `composerProjects` |
| `preloadedBubbles` (`loadGlobalBubblesInRangeAsync` over the union date span) | `preloadedBubbles` |
| `billingAttributionContext` (`createBillingAttributionContextAsync`) — the timestamp match index | `billingAttributionContext` |
| Re-match only: `taskV2Dispatches` + `subagentParentProjects` (subagent → parent project roll-up) | same |

`attachProjectsToBillingEvents` skips its own bubble load / context build whenever these are supplied (`billing-project-attach.ts`, `hasPreparedAttribution`). Per-row matching is an O(log n) binary search (`mostRecentUPWinner` / `tightBubbleWinner`), so ~123 rows resolve in ~150ms. Slicing this per month would only re-scan overlapping data and be slower — it is intentionally front-loaded into prep.

**Re-match specifics** (`retryUnmatched: true`): `pendingOnly: false` (retries prior failures), `fastPath: false` (fuller matching incl. subagent roll-up), month scope = months with pending **or** unmatched rows. Rows that fail again with the **same** `project_unmatch_reason` skip redundant DB writes (`unchangedRetryFailure`).

### Troubleshooting project sync

See **[cursor-project-sync-troubleshooting.md](./cursor-project-sync-troubleshooting.md)** for:

- **Pending vs unmatched vs matched** — why “10,924 rows” is not “10,924 unmatched”
- **Onboarding upload ≠ sync** — pending thousands before `/setup/cursor/sync` completes
- **Mass `no_local_prompts`** after `reset:cursor` without restarting the dev server (regression + fixes)
- **SQL diagnostics** and recovery steps

**Do not revert:** empty bubble prep must fall back to per-batch load; never pass `billingAttributionContext: null` as successful prep.

## Model pricing

Token-based **API eq.** uses rates from [Cursor models & pricing](https://cursor.com/docs/models-and-pricing) (Grok, Composer, Auto) plus third-party API rates (Claude, GPT, Gemini, Kimi, GLM, …). Implementation: `src/lib/pricing/model-pricing.ts`.

| Property | Value |
|----------|-------|
| Storage | `.data/cursor-provider-usage.db` (data dir honors `AGENTIC_USAGE_DATA_DIR`) |
| Tables | `provider_usage_events` (`project`, `composer_id`, `project_unmatch_reason`), `provider_usage_imports` (`date_from`, `date_to` per upload) |
| Reset | `npm run reset:cursor` (`scripts/reset-cursor-data.sh`) deletes the billing DB + `cursor-bubble-index.db` sidecar to replay the upload/attach flow; keeps `agentic-usage.db`, `settings.json`, and the real Cursor `state.vscdb`. Restart the dev server after — it holds open SQLite handles. |
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
- `src/lib/cursor/billing-project-attach.ts` — per-month row matching loop + `onProgress`; reuses prep-built shared data
- `src/lib/cursor/project-sync-background.ts` — background job orchestration, prep phases, prep→per-month data handoff
- `src/lib/cursor/project-sync-target-months.ts` — which months/rows a run targets (`monthNeedsProjectSync`, `rowsToMatchForMonth`)
- `src/lib/cursor/project-sync-client.ts` — client polling (reads latest job incl. finished; never hangs on sub-poll-interval jobs)
- `src/lib/cursor/project-sync-types.ts` — job / month / phase types
- `src/lib/cursor/cursor-bubble-index.ts` — `.data/cursor-bubble-index.db` sidecar build + range queries
- `src/app/api/cursor/attach-projects/sync/route.ts` — `POST` starts job (202), `GET` returns latest job (running or finished)
- `src/components/cursor/csv-upload-dialog.tsx` — upload + sync wizard
- `src/components/cursor/project-sync-provider.tsx` — app-level sync modal orchestration
- `src/components/cursor/project-sync-modal.tsx` / `project-sync-progress-panel.tsx` — blocking modal + prep/sync progress UI
- `src/components/cursor/project-sync-panel.tsx` — read-only Settings status inspector
- `src/lib/cursor/billing-event-attribution.ts` — bubble → composer matching (timestamp context + winners)
- `src/lib/cursor/vscdb-bubbles.ts` — scoped bubble / `task_v2` load for billing window
- `src/lib/cursor/project-attribution.ts` — composer → workspace path map
- `src/lib/pricing/cursor-usage-cost.ts` — format/estimate row cost
- `scripts/reset-cursor-data.sh` — wipe app billing DB + bubble index to replay the flow
- [cursor-project-sync-troubleshooting.md](./cursor-project-sync-troubleshooting.md) — pending vs unmatched, mass failures, reset playbook
