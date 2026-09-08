# Cursor project sync — troubleshooting

**Scope:** Diagnose misleading “thousands unmatched” reports, mass `no_local_prompts` failures, and onboarding upload/sync confusion. Read this before changing project sync or bubble-index prep.

**Key source files:** `src/lib/cursor/project-sync-background.ts`, `src/lib/cursor/billing-project-attach.ts`, `src/lib/cursor/cursor-bubble-index.ts`, `src/lib/cursor/project-sync-target-months.ts`, `src/lib/cursor/provider-usage-db.ts`

**Related docs:** [cursor-provider-usage-csv.md](./cursor-provider-usage-csv.md) · [onboarding.md](./onboarding.md)

---

## How to read the numbers (do this first)

Project sync uses **three disjoint row buckets** in `provider_usage_events`:

| Bucket | SQL / meaning | UI label |
|--------|---------------|----------|
| **Matched** | `project != ''` **and** `composer_id != ''` | `N matched` |
| **Unmatched** | `project_unmatch_reason != ''` | `N unmatched` |
| **Pending** | no project (and no reason) **or** project but no composer (and no reason) | `N need matching` |

These buckets **do not overlap**. Totals should satisfy:

```
matched + unmatched + pending = total billing rows
```

**Common misread:** seeing **10,924 rows** in the Project sync header and assuming they are unmatched. That number is **total imported rows**. After a successful sync, expect ~98% matched and ~200 unmatched for a typical long-running Cursor install — not thousands.

**Spend alerts “Unsynced projects”:** `projectSyncPending` is the sum of **pending** rows only. Before the first sync completes, this equals the full CSV row count (e.g. 10,924) — that is **“not synced yet”**, not **“failed matching”**.

### Quick DB checks

From repo root (default data dir `.data/`):

```bash
sqlite3 .data/cursor-provider-usage.db "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN TRIM(project) != '' AND TRIM(composer_id) != '' THEN 1 ELSE 0 END) AS matched,
  SUM(CASE WHEN TRIM(project_unmatch_reason) != '' THEN 1 ELSE 0 END) AS unmatched,
  SUM(CASE WHEN
    (TRIM(project) = '' AND TRIM(project_unmatch_reason) = '')
    OR (TRIM(project) != '' AND TRIM(composer_id) = '' AND TRIM(project_unmatch_reason) = '')
  THEN 1 ELSE 0 END) AS pending
FROM provider_usage_events;

SELECT project_unmatch_reason, COUNT(*) AS c
FROM provider_usage_events
WHERE TRIM(project_unmatch_reason) != ''
GROUP BY project_unmatch_reason
ORDER BY c DESC;
"
```

Interpretation:

| `project_unmatch_reason` | Meaning | Fix |
|--------------------------|---------|-----|
| `no_local_prompts` | Bubble prep found zero prompts in range | See [Mass no_local_prompts](#mass-no_local_prompts-thousands-failed-at-once) below |
| `no_composer_match` | Prompts exist but no composer for timestamp | Re-match; check bubble index / date window |
| `no_project_path` | Composer found but no workspace path | Expected for deleted/moved repos, cloud-only sessions (~200 rows is normal) |
| `vscdb_not_found` | `state.vscdb` missing | Fix vscdb path in Settings |

---

## Onboarding: upload ≠ sync (pending looks like “thousands unmatched”)

The first-run wizard **splits** CSV import and project sync into two steps:

| Step | Route | What happens |
|------|-------|--------------|
| Upload | `/setup/cursor/upload` | Rows inserted into `cursor-provider-usage.db` — **no project sync** |
| Sync | `/setup/cursor/sync` | Background attach job runs (`startProjectSync({ modal: false })`) |

Settings upload (`CursorCsvUploadDialog`) **does** auto-start sync after import.

**Trap:** User uploads on the onboarding upload step, opens **Settings → Project sync** before completing `/setup/cursor/sync`. Every row is still **pending** → UI shows thousands **need matching**. This is correct pre-sync state, not a regression.

**Rule for agents:** Always ask whether project sync has **finished** before interpreting unmatched counts. Check `pending = 0` in SQL above.

---

## Mass `no_local_prompts` (thousands failed at once)

### Symptom

After upload + first sync (especially after `npm run reset:cursor`):

- Most or all rows get `project_unmatch_reason = 'no_local_prompts'`
- User reports “thousands unmatched”
- Re-match or server restart + re-match often fixes composer matching; remaining ~200 `no_project_path` may persist (legitimate)

### Root cause (regression, fixed)

The performance refactor **front-loads** bubble loading in `project-sync-background.ts` `preparing`:

1. Build bubble sidecar index if needed (`.data/cursor-bubble-index.db`)
2. `loadGlobalBubblesInRangeAsync` over the billing date span
3. `createBillingAttributionContextAsync` → shared match index for all months

**Bug (pre-fix):** If step 2 returned **zero bubbles** (empty/stale index), step 3 produced `null` context. That `null` was passed to `attachProjectsToBillingEvents` as “prep complete.” Attach treated it as authoritative and marked **every row** `no_local_prompts` — potentially 10k+ rows in one pass.

Empty bubble load happens when:

1. **`reset:cursor` without restarting the dev server** — Node keeps an open SQLite handle to the deleted index file; `isCursorBubbleIndexReady` can lie, range queries return nothing.
2. **Sidecar index file missing or corrupt** while server thinks it is ready.
3. **vscdb path wrong** during prep (rare; usually `vscdb_not_found` instead).

### Fixes (must not revert)

| Guard | Location |
|-------|----------|
| Only build/pass `billingAttributionContext` when `preloadedBubbles.length > 0` | `project-sync-background.ts` |
| If prep context is `null`, **fall back** to per-batch bubble load — never mass-apply `no_local_prompts` | `billing-project-attach.ts` |
| Drop in-memory index connection when index file deleted on disk | `cursor-bubble-index.ts` `getIndexDatabase()` |
| ±60s buffer on upload date bounds for bubble preload | `project-sync-background.ts` `resolveBubblePreloadBounds` |
| Upload-scoped sync lists only months with pending/unmatched work | `project-sync-target-months.ts` |

### Code invariant (for future changes)

> **Never pass `billingAttributionContext: null` as “prep succeeded.”**  
> `undefined` = not prepared, attach loads bubbles itself.  
> `null` from an empty preload must trigger fallback, not row-wide failure.

---

## `reset:cursor` checklist

`npm run reset:cursor` deletes:

- `.data/cursor-provider-usage.db` (billing rows)
- `.data/cursor-bubble-index.db` (bubble timestamp sidecar)

It does **not** delete real Cursor `state.vscdb`, Claude data, or `settings.json`.

**Required after reset:**

1. **Stop and restart the dev server** (`npm run dev`) — mandatory; otherwise stale SQLite handles cause empty bubble prep.
2. Re-upload usage-events CSV (or use existing upload if you only wiped attach state).
3. Let project sync **complete** (onboarding sync step or Settings upload modal).
4. Expect ~200 `no_project_path` unmatched on a typical machine — not zero, not thousands.

Documented in `scripts/reset-cursor-data.sh` and [cursor-provider-usage-csv.md](./cursor-provider-usage-csv.md).

---

## Upload paths: Settings vs onboarding

| Source | Sync trigger | `dateFrom` / `dateTo` | Attach `pendingOnly` |
|--------|--------------|----------------------|----------------------|
| Settings `CursorCsvUploadDialog` | Auto on `inserted > 0` | From upload result | `true` (skip prior failures) |
| Onboarding `/setup/cursor/sync` | Auto on page load | Not set (full pending scan) | `false` |
| Settings **Re-match projects** | Manual | Not set | `false`, `retryUnmatched: true` |

All three share the same background job (`POST /api/cursor/attach-projects/sync`) and prep pipeline.

---

## Recovery playbook

| Situation | Action |
|-----------|--------|
| Thousands **pending**, sync never ran | Complete `/setup/cursor/sync` or Settings → Upload CSV / Sync now |
| Thousands **`no_local_prompts`** | Restart dev server → **Re-match projects** (Settings → Billing) |
| ~200 **`no_project_path`** after successful sync | Expected; composers without local workspace. Spend totals still correct. |
| Sync modal stuck / stale progress | Single server process only; poll `GET /api/cursor/attach-projects/sync` — job retained until next run |
| Same CSV re-upload, `inserted === 0` | Duplicates skipped; sync not started. Use **Re-match** if needed. |

---

## Tests

Regression coverage:

- `src/lib/cursor/project-sync-target-months.test.ts` — upload span filters to months with work; re-match includes unmatched months.

When changing prep or attach, run:

```bash
npm test
```

---

## Incident reference (2026-09)

**Report:** “Same upload used to have ~200 unmatched; now thousands” after new onboarding upload flow.

**Actual DB state:** 10,924 total, 10,712 matched, **212 unmatched** (all `no_project_path`), 0 pending — sync had completed successfully.

**False alarm causes identified:**

1. Confusing **pending** (pre-sync) with **unmatched** (failed attach)
2. Mass **`no_local_prompts`** possible on first sync after reset without server restart (real bug, fixed)

**Legitimate ~200 unmatched:** Composer matched, workspace path not resolvable (deleted projects, subagents, etc.).
