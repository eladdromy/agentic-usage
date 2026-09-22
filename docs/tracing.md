# Tracing

Full session tracing indexes local **Claude Code** JSONL logs into a dedicated
SQLite database so the app can render a HarnOps-style explorer: projects →
sessions → a three-column session trace (**Interactions | Requests | Request
breakdown**). It is completely separate from the spend/usage indexer — no
existing billing or leverage logic is touched.

Cursor tracing indexes local **composer/bubble** logs from `state.vscdb` into
`.data/cursor-trace.db`, using the same Tracing UI (harness switch + merged
projects when **All harnesses** is selected).

## Data flow (Claude)

```
~/.claude/projects/**/*.jsonl (+ subagents)
  → src/lib/claude/trace/session-parse.ts   (parse one session into a request timeline)
  → src/lib/db/trace-db.ts                   (incremental index into .data/claude-trace.db)
  → src/app/api/tracing/*                    (query routes)
  → src/app/(app)/tracing/*                  (explorer, sessions, 3-column trace)
```

## Data flow (Cursor)

```
state.vscdb (cursorDiskKV bubbleId:* + composerData:*)
  → src/lib/cursor/trace/composer-parse.ts
  → src/lib/db/cursor-trace-db.ts
  → same /api/tracing/* routes (harness-aware)
  → same Tracing UI
```

Cursor agent bubbles often store thinking as `{ text, signature }` rather than a
plain string. The indexer keeps both: the request timeline labels the row
**thinking**, and the breakdown shows the text plus the signature when one is
present (signature-only blocks are shown as encrypted thinking). Bubbles with no
text, thinking, or tool payload are omitted from the request timeline.
Composer `source_hash` includes a parser revision (`c3`) so the next
**Update trace index** re-parses sessions indexed before that thinking fix.

Parser modules under `src/lib/cursor/trace/` port Agentic_Usage behavior:
interaction segmentation (user prompt → next user), rehydrated bubble time
recovery, checkpoint-revert detection (orphan user bubbles), interaction mode
(Agent/Ask/Plan/Default), `task_v2` subagent branches nested inline, attached
context on breakdown. Interaction cost sums provider CSV rows in the interaction
window when the row’s attach `composer_id` matches **or** the billing timestamp
aligns with **this composer’s** user/agent bubbles (strict 5s / 3s heuristic),
so parallel chats in one workspace still get costs even if project sync attributed
rows to another composer. Costs are stored on the trace index at parse time;
importing new CSV data triggers a cost backfill on indexed Cursor sessions
(`refreshCursorTraceCostsFromProviderCsv`) without re-parsing bubbles. Composer
`source_hash` is bubble count + `composerData` size + parser revision (not
global vscdb mtime), so opening Tracing does not re-index after routine Cursor
usage. A parser revision change re-parses on the next **Update trace index**.

## Parser (`src/lib/claude/trace/`)

Ported and simplified from Agentic_Usage, Claude-only and decoupled from the
Cursor "composer" model.

- `types.ts` — `TraceRequestRow`, `TraceContentPart` (`text` | `thinking` |
  `tool_use` | `tool_result`), `TraceSubagentBranch`, `TraceInteraction`,
  `ParsedSessionFile`.
- `content.ts` — record → content normalization, user-prompt / tool-result
  detection, agent-kind / tool-name extraction, model labels, context-fill %.
- `session-parse.ts` — `parseSessionJsonlFile()` (reads a root session file plus
  its `…/<sessionId>/subagents/*.meta.json` + `.jsonl` branches),
  `parseSessionFromRecords()`, and `groupInteractions()` (a real user prompt
  starts a new interaction; following agent rows attach to it).

## Index (`src/lib/db/trace-db.ts`)

Own better-sqlite3 singleton on `.data/claude-trace.db`. Tables:

- `claude_trace_sessions(session_id PK, project_slug, session_name, started_sec,
  last_request_sec, interaction_count, request_count, user_request_count,
  model_label, cost_usd, file_key, source_hash)`
- `claude_trace_interactions(id PK, session_id, idx, started_sec, ended_sec,
  request_count, model, tool_summary_json, cost_usd)` — **no context columns;
  interaction cards do not show context.** `cost_usd` is the **API-equivalent
  cost** summed over every request in the interaction (including nested subagent
  requests), derived from token usage + model rate (`estimateClaudeUsageCost`),
  not the raw JSONL `costUSD` (which is usually null on subscription usage).
- `claude_trace_requests(id PK, session_id, interaction_idx, seq, record_uuid,
  prompt_id, role, agent_kind, tool_name, tool_use_id, parent_tool_use_id,
  is_subagent, model, created_sec, context_pct, content_json, tokens…,
  cost_usd, preview)` — `cost_usd` is the per-request API-equivalent cost.
  Subagent branch rows are stored inline with `is_subagent = 1` and
  `parent_tool_use_id` set.
- `claude_trace_tool_calls(id PK, request_id, tool_use_id, name, params_json,
  result_json, status)`
- `claude_trace_meta(key PK, value)` — `source_mtime_watermark`.

### Incremental / performant

- **Global gate** — `ensureTraceSynced()` no-ops when the newest discovered file
  mtime hasn't advanced past `source_mtime_watermark`.
- **Per-session skip** — each session stores a `source_hash` (mtime). Only
  new/changed root session files are re-parsed. The **first Update is the only full
  pass**; later **Update trace index** runs only touch changed sessions.
- **Replace-in-transaction** — a changed session's rows are deleted and
  re-inserted in one transaction (idempotent).

Key functions: `ensureTraceSynced()`, `planTraceSync()` (fast changed-file
counts, no parse), `syncTraceProject(slug)` (index one project's changed
sessions — the chunked progress unit), `finalizeTraceSync()`, plus queries
`queryTraceProjects()`, `queryTraceSessions()`, `getTraceSession()`,
`listInteractionRequests()`, `getRequestBreakdown()`.

## API routes (`src/app/api/tracing/*`, `runtime = "nodejs"`)

| Route | Purpose |
|-------|---------|
| `GET /api/tracing/sync/plan` | Projects + changed-file counts for the progress UI |
| `POST /api/tracing/sync` | Body `{ projectSlug }` indexes one project; `{ finalize: true }` sets the watermark |
| `GET /api/tracing/projects` | Projects that have indexed sessions |
| `GET /api/tracing/sessions?projectSlug=&search=&sort=&offset=&limit=` | Paginated sessions (50 + infinite scroll) |
| `GET /api/tracing/session?sessionId=` | Session header + interactions |
| `GET /api/tracing/requests?sessionId=&interaction=` | Request timeline for one interaction (subagent children nested) |
| `GET /api/tracing/request?requestId=` | Full request breakdown |

Indexing runs via the client chunked sync (`POST /api/tracing/sync` + finalize);
read routes query **cursor-trace.db only** (no vscdb bubble scans). Sync plan
uses composer headers only (`scanWorkspaces: false`); spawned subagent ids are
read from trace meta (rebuilt in the background on finalize). CSV cost backfill
yields to the event loop so `npm run dev` stays responsive.

## UI (`src/app/(app)/tracing/`, `src/components/tracing/`)

- `tracing-explorer.tsx` — projects list. A project is listed only when it has
  at least one session with requests. Spawned Cursor subagents stay nested
  under the parent interaction; their placeholder rows are not sessions.
  Composers with no requests (empty chats, drafts) are omitted.
- `trace-sessions-client.tsx` + `trace-sessions-table.tsx` — per-project session
  list with search, sort, infinite scroll, and a cost cell. Same filter:
  `request_count > 0` only.
- `session-trace-panel.tsx` — three columns: `interaction-column.tsx`,
  `request-column.tsx`, `request-breakdown-column.tsx` (text / thinking / tool
  params + results). Selection is tracked by part `timelineId`; the breakdown is
  fetched by the part's parent `requestId`.
- `request-column.tsx` mirrors the HarnOps session-trace layout: `listInteraction
  Requests()` **explodes each DB record into ordered content parts** (thinking /
  text / one part per tool_use / tool_result). User prompts render as cards
  (title + timestamp + preview); agent parts render as compact rows (kind label +
  timestamp, no preview); a `tool_use` part is paired with its matching
  `tool_result` (by `toolUseId`); a flow arrow separates user and agent parts.
  An `Agent` tool_use is a **dispatch** part whose matching subagent branch rows
  are nested inline in a collapsible block (subagent aggregation — no extra
  fetch). Column subtitle reads `N requests · interaction {idx}` (N counts nested
  subagent parts).
- Nav item `Tracing` is added in `src/components/app-shell.tsx`; skeletons live in
  `src/components/layout/page-loading-skeletons.tsx`.

**Interaction cards** show interaction number, timestamp, Duration, Requests,
Model, Types, and Cost — **never a "Context" label or value**. Cursor **Model**
uses provider CSV rows in the interaction window (same composer attribution as
cost — billed model id), then the **previous interaction’s** model when CSV has
no rows (Cursor often omits `modelInfo` on follow-up user prompts; Agentic_Usage
composer detail uses user-bubble `modelInfo` only for the label).

### On-demand index UX

Opening `/tracing` never indexes logs. The projects list and session pages query
the existing SQLite index immediately (`GET /api/tracing/projects` and
`GET /api/tracing/sessions`).

`trace-sync-provider.tsx` wraps the tracing routes (`layout.tsx`) and onboarding
trace step, but **does not** start a job on mount. **Update trace index** on the
projects list (and **Start indexing** during onboarding) calls
`startTraceSync()`, which runs `runTraceSyncChunks()`: `GET /api/tracing/sync/plan`,
then sequential `POST /api/tracing/sync` in **small chunks** (8 Claude sessions /
4 Cursor composers per request). Progress is `trace-sync-progress-panel.tsx`
inside `trace-sync-modal.tsx` (non-dismissible until `done` or `error`; the
project list scrolls inside a `max-h` dialog so a long index stays on screen). When
nothing changed the job finishes immediately. If every in-scope harness is still
`spend_only`, the explorer disables the button and says full tracing must be
**saved** in Settings first. Saving the setting does not index; the user still
clicks **Update trace index**. Project and session routes have no sync UI.

## `traceMode` (onboarding + settings)

`AppSettings.traceMode: Partial<Record<HarnessKind, "spend_only" |
"full_tracing">>` (default `spend_only`) is the single source of truth for
whether trace indexing runs for a harness.

- **Onboarding** (`src/lib/onboarding/navigation.ts`, `src/app/setup/`):
  - Claude: `mode` → `sync` → `trace` (only when `full_tracing`, reuses the
    progress UX; sets `onboardingClaudeTraceIndexed`) → `subscription`.
  - Cursor: `mode` (full tracing disabled, "Coming soon") → `upload` → `sync` →
    `subscription`.
  - Step totals in `src/lib/onboarding/setup-steps.ts` are mode-aware
    (Claude: 3 spend-only / 4 with tracing; Cursor: 4). The spend readiness gate
    (`isClaudeHarnessReady`) is unchanged, and a trace-index failure does not
    block onboarding completion.
- **Settings** (`src/components/settings/tracing-settings-control.tsx`): a per-
  harness Tracing control (Spend only / Full tracing) persisted via
  `PUT /api/settings`. Saving full tracing does not index. Build or refresh the
  index from Tracing with **Update trace index**. Cursor is shown disabled.

## Reset

`npm run reset:trace` (`scripts/reset-trace-data.sh`) deletes only
`claude-trace.db` and `cursor-trace.db` (+ `-wal`/`-shm`). It never touches your
real logs, `agentic-usage.db`, the other Cursor databases, or `settings.json`.
Stop the dev server first. Rebuild requires `traceMode` set to `full_tracing`
(and saved) for each harness you index; then open Tracing and click
**Update trace index**.
