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

## Model pricing

Token-based **API eq.** uses rates from [Cursor models & pricing](https://cursor.com/docs/models-and-pricing) (Grok, Composer, Auto) plus third-party API rates (Claude, GPT, Gemini, Kimi, GLM, …). Implementation: `src/lib/pricing/model-pricing.ts`.

| Property | Value |
|----------|-------|
| Storage | `.data/cursor-provider-usage.db` |
| Tables | `provider_usage_events` (`project`, `composer_id`, `project_unmatch_reason`), `provider_usage_imports` |
| API | `POST /api/cursor/provider-usage/upload`, `POST /api/cursor/attach-projects` |
| Dedup | `row_hash` per CSV row |

Export from Cursor billing dashboard as `usage-events` (often without a `.csv` suffix). Upload accepts any file whose name or header matches the usage-events export.

## Spend Logs & Leverage

Both pages query `provider_usage_events` directly — no full vscdb conversation indexing, no live timestamp join at read time.

- **Spend Logs** — paginated billing rows with stored project (from CSV column or post-upload attach), matched composer id, and API-equivalent cost. Filters: project, model, timeframe (including custom range popover), sort by last request or highest spend.
- **Leverage** — monthly totals and sparklines from CSV dates

`GET /api/cursor/billing-coverage` also returns `projectAttribution` stats and an unmatched-rows preview for the UI.

## Uploaded period & export links

`GET /api/cursor/billing-coverage` derives date bounds from CSV rows:

- `dataRange` — first and last calendar day in uploaded data
- `uploadedMonths` — calendar months with at least one billing row
- `missingMonths` — calendar months from first upload through today with no rows (gaps are months, not individual days)
- `periods` — one entry per calendar month in the CSV (with Cursor dashboard export URLs)
- `exportAll` — full uploaded span
- `extendToToday` — trailing missing month when the current month has no uploaded rows yet

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
