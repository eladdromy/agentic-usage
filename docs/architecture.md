# Architecture

Plan Leverage is a **local Next.js app** that serves a browser UI for subscription leverage analytics. Supports **Claude Code** and **Cursor** harnesses (switch in the top navbar).

## Data flow

```mermaid
flowchart LR
  subgraph claude [Claude harness]
    JSONL["~/.claude/projects/**/*.jsonl"]
    ClaudeDB["plan-leverage.db\nclaude_usage_events"]
    JSONL --> ClaudeDB
    ClaudeDB --> API
  end

  subgraph cursor [Cursor harness]
    CSV["usage-events CSV upload"]
    BillingDB["cursor-provider-usage.db"]
    VSCDB["state.vscdb"]
    CSV --> BillingDB
    BillingDB --> API
    CSV -.->|"date-range bubble scan"| VSCDB
    VSCDB -->|"project attach"| BillingDB
    VSCDB --> Plan["subscription plan auto-detect"]
  end

  API["app/api/*"]
  UI["React pages"]
  API --> UI
```

## Components

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind 4, shadcn/ui, recharts, Plus Jakarta Sans, next-themes |
| Index | better-sqlite3 |
| Config | `~/.claude.json`, `.data/settings.json`, optional `VSCDB_PATH` |

## Harness selection

`activeHarness` in `.data/settings.json` (`claude` | `cursor` | `all`). When unset, auto-defaults to Cursor if only vscdb exists, else Claude. Switch in the top navbar; **All harnesses** merges Claude and Cursor rows on Spend Logs.

## Sync

- **Claude** — JSONL mtime watermark; one row per assistant message with `message.usage`. Triggered on navigation and manual Re-index.
- **Cursor** — **no full log indexing**. Spend and leverage read uploaded **usage-events CSV** only. After CSV import, **scoped** reads of `state.vscdb` (user/agent bubbles in the billing date range) attach project paths; subscription plan still auto-detects from ItemTable profile keys.

## API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/raw-spend` | GET | Paginated spend rows (harness-aware) |
| `/api/projects-breakdown` | GET | Per-project all-time API eq + subscription spend (allocated by monthly API-eq share), first→last billed request range; merges same workspace across harnesses |
| `/api/plan-leverage` | GET | Yearly/monthly leverage table rows + sparklines; supports **all harnesses** with expandable per-harness breakdown |
| `/api/profile` | GET | Paths, counts, harness, plan |
| `/api/settings` | GET/PUT | Plan overrides, harness, sync settings |
| `/api/settings/plan-months` | GET | Months with usage + tier presets for subscription UI |
| `/api/sync` | POST | Re-index Claude JSONL (no-op for Cursor) |
| `/api/cursor/provider-usage/upload` | POST | Import billing CSV + project attach |
| `/api/cursor/attach-projects` | POST | Re-run project attach on stored CSV rows |
| `/api/cursor/billing-coverage` | GET | CSV date range, export links, unmatched preview |

## Security

All data stays on the local machine. No auth, no cloud, no outbound telemetry.

## Page loading

Every analytics page uses the same loading pattern:

1. **Static header** — `PageHeader` renders immediately (also in each route’s `Suspense` fallback) so the title and description never jump.
2. **Content skeleton** — shared layouts in `src/components/layout/page-loading-skeletons.tsx` mirror the final page structure (filters, tables, cards).
3. **Indexing** — Claude log sync shows a compact **Indexing…** spinner in the app header only; page bodies stay on skeletons until data is ready (no separate indexing card).

Initial load covers both route sync (`syncing`) and the first API fetch (`loading` while `data == null`).
